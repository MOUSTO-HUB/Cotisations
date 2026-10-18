import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { SmsSender } from '../src/auth/sms/sms-sender';

/** Capture les SMS au lieu de les envoyer, pour lire le code dans les tests. */
export class FakeSmsSender extends SmsSender {
  readonly sent: { phone: string; message: string }[] = [];
  send(phone: string, message: string) {
    this.sent.push({ phone, message });
    return Promise.resolve();
  }
  lastCode(): string {
    const last = this.sent.at(-1);
    const match = last && /\b(\d{6})\b/.exec(last.message);
    if (!match) throw new Error('Aucun code envoyé');
    return match[1];
  }
}

export interface VerifyBody {
  token: string;
  isNewUser: boolean;
  user: {
    id: string;
    phone: string;
    fullName: string;
    country: string;
    hasPin: boolean;
  };
}

export async function createTestApp() {
  const sms = new FakeSmsSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsSender)
    .useValue(sms)
    .compile();
  const app: INestApplication<App> = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return { app, sms };
}

/**
 * Numéro guinéen aléatoire et unique : la base de test n'est jamais effacée,
 * et la limite de demandes de code s'applique par numéro.
 */
const usedPhones = new Set<string>();
export function randomPhone(): string {
  const phone = `62${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  if (usedPhones.has(phone)) return randomPhone();
  usedPhones.add(phone);
  return phone;
}

/** Crée un compte et renvoie son jeton de session. */
export async function signUp(
  app: INestApplication<App>,
  sms: FakeSmsSender,
  fullName = 'Mamadou Diallo',
  phone = randomPhone(),
): Promise<VerifyBody & { auth: { Authorization: string } }> {
  const http = request(app.getHttpServer());
  await http.post('/auth/otp/request').send({ phone }).expect(200);
  const res = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({ phone, code: sms.lastCode(), fullName })
    .expect(200);
  const body = res.body as VerifyBody;
  return { ...body, auth: { Authorization: `Bearer ${body.token}` } };
}
