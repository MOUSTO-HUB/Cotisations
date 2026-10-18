import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, FakeSmsSender, signUp } from './helpers';

interface DueBody {
  id: string;
  dueDate: string;
  amountDue: string;
  status: string;
  penaltyOfId: string | null;
}

describe('Pénalités de retard et alertes (e2e)', () => {
  let app: INestApplication<App>;
  let sms: FakeSmsSender;

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** 3 membres, cotisation mensuelle de 50 000 GNF de janvier à mars 2026 : tout est en retard. */
  async function setup() {
    const president = await signUp(app, sms, 'Elhadj Diallo');
    const treasurer = await signUp(app, sms, 'Ibrahima Sow');
    const member = await signUp(app, sms, 'Aïssatou Bah');
    const group = (
      await http()
        .post('/groups')
        .set(president.auth)
        .send({ type: 'FAMILY', name: 'Famille Diallo' })
        .expect(201)
    ).body as { id: string };
    for (const [user, role] of [
      [treasurer, 'TREASURER'],
      [member, 'MEMBER'],
    ] as const) {
      await http()
        .post(`/groups/${group.id}/members`)
        .set(president.auth)
        .send({ phone: user.user.phone, role })
        .expect(201);
      await http().post(`/groups/${group.id}/join`).set(user.auth).expect(200);
    }
    await http()
      .post(`/groups/${group.id}/plans`)
      .set(president.auth)
      .send({
        name: 'Cotisation 2026',
        amount: '50000',
        periodicity: 'MONTHLY',
        startDate: '2026-01-05',
        endDate: '2026-03-31',
      })
      .expect(201);
    const setRules = (body: object, status = 200) =>
      http()
        .patch(`/groups/${group.id}/rules`)
        .set(president.auth)
        .send(body)
        .expect(status);
    const apply = (auth = treasurer.auth, status = 200) =>
      http()
        .post(`/groups/${group.id}/penalties/apply`)
        .set(auth)
        .expect(status);
    const myDues = async () =>
      (
        await http()
          .get(`/groups/${group.id}/me/dues`)
          .set(member.auth)
          .expect(200)
      ).body as { dues: DueBody[]; outstanding: string };
    return { president, treasurer, member, group, setRules, apply, myDues };
  }

  it('sans règle de pénalité, rien n’est appliqué', async () => {
    const s = await setup();
    const res = (await s.apply()).body as { created: number };
    expect(res.created).toBe(0);
  });

  it('RG-P2 : pénalité fixe sur chaque échéance en retard, jamais en double', async () => {
    const s = await setup();
    await s.setRules({ penaltyMode: 'FIXED', penaltyValue: '5000' });

    const first = (await s.apply()).body as { created: number; total: string };
    expect(first).toEqual({ created: 9, total: '45000' }); // 3 membres × 3 retards
    const again = (await s.apply()).body as { created: number };
    expect(again.created).toBe(0);

    const { dues, outstanding } = await s.myDues();
    const penalties = dues.filter((d) => d.penaltyOfId);
    expect(penalties).toHaveLength(3);
    expect(penalties.every((p) => p.amountDue === '5000')).toBe(true);
    expect(outstanding).toBe('165000'); // 150 000 + 3 × 5 000
  });

  it('RG-P2 : pénalité en pourcentage de l’échéance', async () => {
    const s = await setup();
    await s.setRules({ penaltyMode: 'PERCENT', penaltyValue: '10' });
    const res = (await s.apply()).body as { total: string };
    expect(res.total).toBe('45000'); // 10 % de 50 000 = 5 000, × 9
  });

  it('le président annule une pénalité avec un motif (exonération tracée)', async () => {
    const s = await setup();
    await s.setRules({ penaltyMode: 'FIXED', penaltyValue: '5000' });
    await s.apply();
    const penalty = (await s.myDues()).dues.find((d) => d.penaltyOfId)!;
    await http()
      .post(`/groups/${s.group.id}/dues/${penalty.id}/exempt`)
      .set(s.president.auth)
      .send({ reason: 'Retard dû à une hospitalisation.' })
      .expect(200);
    const after = (await s.myDues()).dues.find((d) => d.id === penalty.id)!;
    expect(after.status).toBe('EXEMPT');
  });

  it('refuse un pourcentage supérieur à 100 et une pénalité sans montant', async () => {
    const s = await setup();
    await s.setRules({ penaltyMode: 'PERCENT', penaltyValue: '150' }, 400);
    await s.setRules({ penaltyMode: 'FIXED' }, 400);
  });

  it('un simple membre ne peut pas appliquer les pénalités', async () => {
    const s = await setup();
    await s.apply(s.member.auth, 403);
  });

  it('RG-P3 : le bureau voit les membres qui atteignent le seuil de retards', async () => {
    const s = await setup();
    const res = await http()
      .get(`/groups/${s.group.id}/alerts`)
      .set(s.president.auth)
      .expect(200);
    const body = res.body as {
      threshold: number;
      members: { name: string; lateDueCount: number; lateAmount: string }[];
    };
    expect(body.threshold).toBe(3);
    expect(body.members).toHaveLength(3);
    expect(body.members[0]).toMatchObject({
      lateDueCount: 3,
      lateAmount: '150000',
    });

    await s.setRules({ lateAlertThreshold: 4 });
    const higher = await http()
      .get(`/groups/${s.group.id}/alerts`)
      .set(s.president.auth)
      .expect(200);
    expect((higher.body as { members: unknown[] }).members).toHaveLength(0);

    await http()
      .get(`/groups/${s.group.id}/alerts`)
      .set(s.member.auth)
      .expect(403);
  });
});
