import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  generateToken,
  hashSecret,
  sha256,
  verifySecret,
} from '../common/hashing';
import {
  countryOfPhone,
  InvalidPhoneError,
  normalizePhone,
} from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../users/public-user';
import { SmsSender } from './sms/sms-sender';

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REQUESTS = 3;
export const OTP_REQUEST_WINDOW_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsSender,
  ) {}

  async requestOtp(phoneInput: string) {
    const phone = this.parsePhone(phoneInput);
    const now = Date.now();

    const recent = await this.prisma.otpChallenge.count({
      where: {
        phone,
        createdAt: { gte: new Date(now - OTP_REQUEST_WINDOW_MS) },
      },
    });
    if (recent >= OTP_MAX_REQUESTS) {
      throw new HttpException(
        'Trop de demandes de code. Réessayez dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otpChallenge.create({
      data: {
        phone,
        codeHash: await hashSecret(code),
        expiresAt: new Date(now + OTP_TTL_MS),
      },
    });
    await this.sms.send(
      phone,
      `Votre code Cotisations : ${code}. Il expire dans 5 minutes. Ne le partagez avec personne.`,
    );

    return { phone, expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  async verifyOtp(input: {
    phone: string;
    code: string;
    fullName?: string;
    device?: string;
  }) {
    const phone = this.parsePhone(input.phone);
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new UnauthorizedException(
        'Code expiré ou inconnu. Demandez un nouveau code.',
      );
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        "Trop d'essais. Demandez un nouveau code.",
      );
    }
    if (!(await verifySecret(input.code, challenge.codeHash))) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Code incorrect.');
    }

    let user = await this.prisma.user.findUnique({ where: { phone } });
    const fullName = input.fullName?.trim();
    if (!user && !fullName) {
      // Le code reste valide : l'application redemande avec le nom.
      throw new BadRequestException({
        message: 'Nom complet requis pour créer le compte.',
        code: 'FULL_NAME_REQUIRED',
      });
    }

    // Consommation atomique : un code ne sert qu'une fois.
    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException(
        'Code expiré ou inconnu. Demandez un nouveau code.',
      );
    }

    const isNewUser = !user;
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, fullName: fullName!, country: countryOfPhone(phone) },
      });
    }

    const token = generateToken();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        device: input.device,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return {
      token,
      expiresAt: session.expiresAt,
      isNewUser,
      user: toPublicUser(user),
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  private parsePhone(input: string): string {
    try {
      return normalizePhone(input);
    } catch (error) {
      if (error instanceof InvalidPhoneError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
