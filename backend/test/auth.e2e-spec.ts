import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  FakeSmsSender,
  randomPhone as nextPhone,
  VerifyBody,
} from './helpers';

describe('Authentification (e2e)', () => {
  let app: INestApplication<App>;
  let sms: FakeSmsSender;

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function signUp(phone: string, fullName = 'Mamadou Diallo') {
    await http().post('/auth/otp/request').send({ phone }).expect(200);
    const res = await http()
      .post('/auth/otp/verify')
      .send({ phone, code: sms.lastCode(), fullName })
      .expect(200);
    return res.body as VerifyBody;
  }

  it('crée un compte guinéen avec un numéro saisi sans indicatif', async () => {
    const phone = nextPhone();
    const res = await http()
      .post('/auth/otp/request')
      .send({ phone })
      .expect(200);
    expect(res.body).toEqual({
      phone: `+224${phone}`,
      expiresInSeconds: 300,
    });
    expect(sms.sent.at(-1)?.phone).toBe(`+224${phone}`);

    const verify = await http()
      .post('/auth/otp/verify')
      .send({ phone, code: sms.lastCode(), fullName: 'Aïssatou Bah' })
      .expect(200);
    const body = verify.body as VerifyBody;
    expect(body.isNewUser).toBe(true);
    expect(body.token).toEqual(expect.any(String));
    expect(body.user).toMatchObject({
      phone: `+224${phone}`,
      fullName: 'Aïssatou Bah',
      country: 'GN',
      hasPin: false,
    });
  });

  it('exige le nom à la première connexion sans consommer le code', async () => {
    const phone = nextPhone();
    await http().post('/auth/otp/request').send({ phone }).expect(200);
    const code = sms.lastCode();

    const missing = await http()
      .post('/auth/otp/verify')
      .send({ phone, code })
      .expect(400);
    expect((missing.body as { code: string }).code).toBe('FULL_NAME_REQUIRED');

    await http()
      .post('/auth/otp/verify')
      .send({ phone, code, fullName: 'Ibrahima Sow' })
      .expect(200);
  });

  it('reconnecte un utilisateur existant sans redemander son nom', async () => {
    const phone = nextPhone();
    await signUp(phone);
    await http().post('/auth/otp/request').send({ phone }).expect(200);
    const res = await http()
      .post('/auth/otp/verify')
      .send({ phone, code: sms.lastCode() })
      .expect(200);
    expect((res.body as VerifyBody).isNewUser).toBe(false);
  });

  it('refuse un code incorrect, puis bloque après 5 essais', async () => {
    const phone = nextPhone();
    await http().post('/auth/otp/request').send({ phone }).expect(200);
    const good = sms.lastCode();
    const bad = good === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      await http()
        .post('/auth/otp/verify')
        .send({ phone, code: bad, fullName: 'Test' })
        .expect(401);
    }
    const blocked = await http()
      .post('/auth/otp/verify')
      .send({ phone, code: good, fullName: 'Test' })
      .expect(401);
    expect((blocked.body as { message: string }).message).toContain(
      "Trop d'essais",
    );
  });

  it("n'accepte un code qu'une seule fois", async () => {
    const phone = nextPhone();
    await http().post('/auth/otp/request').send({ phone }).expect(200);
    const code = sms.lastCode();
    await http()
      .post('/auth/otp/verify')
      .send({ phone, code, fullName: 'Test' })
      .expect(200);
    await http()
      .post('/auth/otp/verify')
      .send({ phone, code, fullName: 'Test' })
      .expect(401);
  });

  it('limite à 3 demandes de code par quart d’heure', async () => {
    const phone = nextPhone();
    for (let i = 0; i < 3; i++) {
      await http().post('/auth/otp/request').send({ phone }).expect(200);
    }
    await http().post('/auth/otp/request').send({ phone }).expect(429);
  });

  it('refuse un numéro invalide', async () => {
    await http().post('/auth/otp/request').send({ phone: '1234' }).expect(400);
  });

  describe('session', () => {
    it('protège /me et l’ouvre avec le jeton', async () => {
      await http().get('/me').expect(401);
      const { token } = await signUp(nextPhone(), 'Fatoumata Camara');
      const me = await http()
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body).toMatchObject({ fullName: 'Fatoumata Camara' });
    });

    it('met à jour le profil et normalise le numéro Mobile Money', async () => {
      const { token } = await signUp(nextPhone());
      const res = await http()
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ language: 'en', mobileMoneyNumber: '664 12 34 56' })
        .expect(200);
      expect(res.body).toMatchObject({
        language: 'en',
        mobileMoneyNumber: '+224664123456',
      });
    });

    it('enregistre un PIN et refuse un PIN trop simple', async () => {
      const { token } = await signUp(nextPhone());
      const auth = { Authorization: `Bearer ${token}` };
      await http().put('/me/pin').set(auth).send({ pin: '1234' }).expect(400);
      await http().put('/me/pin').set(auth).send({ pin: '2580' }).expect(204);
      const me = await http().get('/me').set(auth).expect(200);
      expect(me.body).toMatchObject({ hasPin: true });
      expect(JSON.stringify(me.body)).not.toContain('pinHash');
    });

    it('invalide le jeton à la déconnexion', async () => {
      const { token } = await signUp(nextPhone());
      const auth = { Authorization: `Bearer ${token}` };
      await http().post('/auth/logout').set(auth).expect(204);
      await http().get('/me').set(auth).expect(401);
    });
  });
});
