import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Put,
} from '@nestjs/common';
import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { hashSecret } from '../common/hashing';
import { InvalidPhoneError, normalizePhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { SetPinDto } from './dto/set-pin.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { isWeakPin } from './pin-policy';
import { toPublicUser } from './public-user';

@Controller('me')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return toPublicUser(auth.user);
  }

  @Patch()
  async update(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateMeDto) {
    let mobileMoneyNumber = dto.mobileMoneyNumber;
    if (mobileMoneyNumber !== undefined) {
      try {
        mobileMoneyNumber = normalizePhone(mobileMoneyNumber);
      } catch (error) {
        if (error instanceof InvalidPhoneError) {
          throw new BadRequestException('Numéro Mobile Money invalide.');
        }
        throw error;
      }
    }
    const user = await this.prisma.user.update({
      where: { id: auth.user.id },
      data: {
        fullName: dto.fullName?.trim(),
        language: dto.language,
        mobileMoneyNumber,
      },
    });
    return toPublicUser(user);
  }

  @Put('pin')
  @HttpCode(204)
  async setPin(@CurrentAuth() auth: AuthContext, @Body() dto: SetPinDto) {
    if (isWeakPin(dto.pin)) {
      throw new BadRequestException(
        'Code PIN trop simple. Évitez les chiffres identiques ou qui se suivent.',
      );
    }
    await this.prisma.user.update({
      where: { id: auth.user.id },
      data: { pinHash: await hashSecret(dto.pin) },
    });
  }
}
