import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, FakeSmsSender, signUp } from './helpers';

interface CampaignBody {
  id: string;
  cashboxId: string;
  reason: string;
  status: string;
  collected: string;
  paidOut: string;
  transferredToFund: string;
  balance: string;
  progress: number;
  notifiedMembers?: number;
}

describe('Collectes de solidarité (e2e)', () => {
  let app: INestApplication<App>;
  let sms: FakeSmsSender;

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function setup() {
    const president = await signUp(app, sms, 'Elhadj Diallo');
    const treasurer = await signUp(app, sms, 'Ibrahima Sow');
    const auditor = await signUp(app, sms, 'Mariama Baldé');
    const member = await signUp(app, sms, 'Kadiatou Barry');
    const group = (
      await http()
        .post('/groups')
        .set(president.auth)
        .send({ type: 'FAMILY', name: 'Famille Diallo' })
        .expect(201)
    ).body as { id: string; cashboxes: { id: string; kind: string }[] };
    for (const [user, role] of [
      [treasurer, 'TREASURER'],
      [auditor, 'AUDITOR'],
      [member, 'MEMBER'],
    ] as const) {
      await http()
        .post(`/groups/${group.id}/members`)
        .set(president.auth)
        .send({ phone: user.user.phone, role })
        .expect(201);
      await http().post(`/groups/${group.id}/join`).set(user.auth).expect(200);
    }
    const fund = group.cashboxes.find((c) => c.kind === 'SOLIDARITY')!.id;
    return { president, treasurer, auditor, member, group, fund };
  }

  async function openCampaign(
    s: Awaited<ReturnType<typeof setup>>,
    body: object = {},
  ) {
    return (
      await http()
        .post(`/groups/${s.group.id}/solidarity`)
        .set(s.treasurer.auth)
        .send({
          beneficiaryName: 'Tante Fatoumata',
          reasonCategory: 'HEALTH',
          reasonNote: 'Hospitalisation à Donka',
          targetAmount: '3000000',
          suggestedAmount: '100000',
          deadline: '2027-05-30',
          ...body,
        })
        .expect(201)
    ).body as CampaignBody;
  }

  const donate = (
    s: Awaited<ReturnType<typeof setup>>,
    cashboxId: string,
    amount: string,
    donorName = 'Oncle Mamadou (Paris)',
  ) =>
    http()
      .post(`/groups/${s.group.id}/donations`)
      .set(s.treasurer.auth)
      .send({ cashboxId, amount, donorName, idempotencyKey: randomUUID() })
      .expect(201);

  it('ouverture en une requête, motif général, tous les membres prévenus par SMS', async () => {
    const s = await setup();
    sms.sent.length = 0;
    const c = await openCampaign(s);
    expect(c.reason).toBe('raison de santé — Hospitalisation à Donka');
    expect(c.notifiedMembers).toBe(3); // tous sauf celui qui ouvre
    expect(sms.sent[0].message).toContain(
      'collecte de solidarité pour Tante Fatoumata (raison de santé)',
    );
    expect(sms.sent[0].message).toContain('3 000 000 GNF avant le 30/05/2027');
  });

  it('un simple membre ne peut pas ouvrir de collecte', async () => {
    const s = await setup();
    await http()
      .post(`/groups/${s.group.id}/solidarity`)
      .set(s.member.auth)
      .send({
        beneficiaryName: 'Test',
        reasonCategory: 'OTHER',
        targetAmount: '1000',
        deadline: '2027-05-30',
      })
      .expect(403);
  });

  it('RG-S1 : tout versement exige un second validateur, même petit', async () => {
    const s = await setup();
    const c = await openCampaign(s);
    await donate(s, c.cashboxId, '500000');

    const payout = (
      await http()
        .post(`/groups/${s.group.id}/expenses`)
        .set(s.treasurer.auth)
        .send({
          cashboxId: c.cashboxId,
          amount: '50000', // bien sous le seuil des dépenses ordinaires
          category: 'aide',
          label: 'Ordonnance — pharmacie de Kaloum',
          idempotencyKey: randomUUID(),
        })
        .expect(201)
    ).body as { id: string; status: string };
    expect(payout.status).toBe('PENDING_APPROVAL');

    await http()
      .post(`/groups/${s.group.id}/expenses/${payout.id}/approve`)
      .set(s.auditor.auth)
      .expect(200);
    const after = (
      await http()
        .get(`/groups/${s.group.id}/solidarity/${c.id}`)
        .set(s.member.auth)
        .expect(200)
    ).body as CampaignBody;
    expect(after).toMatchObject({
      collected: '500000',
      paidOut: '50000',
      balance: '450000',
      progress: 16,
    });
  });

  it('RG-S4 : collecte obligatoire = une échéance par membre, bénéficiaire dispensé', async () => {
    const s = await setup();
    const members = (
      await http()
        .get(`/groups/${s.group.id}/members`)
        .set(s.president.auth)
        .expect(200)
    ).body as { membershipId: string; fullName: string }[];
    const beneficiary = members.find((m) => m.fullName === 'Kadiatou Barry')!;
    await openCampaign(s, {
      beneficiaryName: 'Kadiatou Barry',
      beneficiaryMembershipId: beneficiary.membershipId,
      reasonCategory: 'DEATH',
      reasonNote: undefined,
      mandatory: true,
    });
    const dues = (
      await http()
        .get(`/groups/${s.group.id}/dues`)
        .set(s.president.auth)
        .expect(200)
    ).body as { membershipId: string; amountDue: string; planName: string }[];
    expect(dues).toHaveLength(3);
    expect(dues.every((d) => d.amountDue === '100000')).toBe(true);
    expect(dues.map((d) => d.membershipId)).not.toContain(
      beneficiary.membershipId,
    );
  });

  it('une collecte obligatoire exige un montant par membre', async () => {
    const s = await setup();
    await http()
      .post(`/groups/${s.group.id}/solidarity`)
      .set(s.treasurer.auth)
      .send({
        beneficiaryName: 'Test',
        reasonCategory: 'DEATH',
        targetAmount: '1000',
        deadline: '2027-05-30',
        mandatory: true,
      })
      .expect(400);
  });

  it('RG-S3 : à la clôture, l’excédent va au fonds de solidarité ; plus de dons ensuite', async () => {
    const s = await setup();
    const c = await openCampaign(s);
    await donate(s, c.cashboxId, '300000');

    const closed = (
      await http()
        .post(`/groups/${s.group.id}/solidarity/${c.id}/close`)
        .set(s.president.auth)
        .send({ surplusTo: 'SOLIDARITY_FUND' })
        .expect(200)
    ).body as CampaignBody;
    expect(closed).toMatchObject({
      status: 'PAID_OUT',
      transferredToFund: '300000',
      balance: '0',
    });
    const boxes = (
      await http()
        .get(`/groups/${s.group.id}/cashboxes`)
        .set(s.member.auth)
        .expect(200)
    ).body as { id: string; balance: string }[];
    expect(boxes.find((b) => b.id === s.fund)!.balance).toBe('300000');

    await http()
      .post(`/groups/${s.group.id}/donations`)
      .set(s.treasurer.auth)
      .send({
        cashboxId: c.cashboxId,
        amount: '1000',
        donorName: 'Retardataire',
        idempotencyKey: randomUUID(),
      })
      .expect(409);
  });

  it('RG-S3 : l’excédent peut rester pour le bénéficiaire, versé ensuite avec validation', async () => {
    const s = await setup();
    const c = await openCampaign(s);
    await donate(s, c.cashboxId, '200000');
    const closed = (
      await http()
        .post(`/groups/${s.group.id}/solidarity/${c.id}/close`)
        .set(s.president.auth)
        .send({ surplusTo: 'BENEFICIARY' })
        .expect(200)
    ).body as CampaignBody;
    expect(closed).toMatchObject({ status: 'CLOSED', balance: '200000' });
  });

  it('un don se corrige par contre-écriture', async () => {
    const s = await setup();
    const c = await openCampaign(s);
    const d = (await donate(s, c.cashboxId, '75000')).body as { id: string };
    await http()
      .post(`/groups/${s.group.id}/donations/${d.id}/reverse`)
      .set(s.treasurer.auth)
      .send({ reason: 'Saisi dans la mauvaise collecte.' })
      .expect(200);
    const after = (
      await http()
        .get(`/groups/${s.group.id}/solidarity/${c.id}`)
        .set(s.member.auth)
        .expect(200)
    ).body as CampaignBody;
    expect(after).toMatchObject({ collected: '0', balance: '0' });
  });
});
