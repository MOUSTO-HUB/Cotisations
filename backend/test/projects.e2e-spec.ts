import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, FakeSmsSender, signUp } from './helpers';

type Auth = { Authorization: string };
interface ProjectBody {
  id: string;
  status: string;
  cashboxId: string;
  targetAmount: string;
  budget: {
    total: string;
    lines: {
      id: string;
      label: string;
      planned: string;
      committed: string;
      spent: string;
      overrun: boolean;
    }[];
  };
  collection: {
    collected: string;
    spent: string;
    transferredOut: string;
    balance: string;
    progress: number;
  };
  contributors: { name: string; amount: string }[];
  updates: { title: string }[];
  plan?: {
    planId: string;
    amountPerMember: string;
    installments: { dueDate: string; amount: string }[];
    memberCount: number;
  };
}

describe('Projets communautaires (e2e)', () => {
  let app: INestApplication<App>;
  let sms: FakeSmsSender;

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Association avec président, trésorier, contrôleur et 1 membre (4 membres actifs). */
  async function setup() {
    const president = await signUp(app, sms, 'Elhadj Diallo');
    const treasurer = await signUp(app, sms, 'Ibrahima Sow');
    const auditor = await signUp(app, sms, 'Mariama Baldé');
    const member = await signUp(app, sms, 'Alpha Barry');
    const group = (
      await http()
        .post('/groups')
        .set(president.auth)
        .send({ type: 'COMMUNITY', name: 'Ressortissants de Pita' })
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
    const members = (
      await http()
        .get(`/groups/${group.id}/members`)
        .set(president.auth)
        .expect(200)
    ).body as { membershipId: string; fullName: string }[];
    const membershipOf = (name: string) =>
      members.find((m) => m.fullName === name)!.membershipId;

    const url = (path = '') => `/groups/${group.id}/projects${path}`;
    const project = (
      await http()
        .post(url())
        .set(president.auth)
        .send({
          title: 'Puits de Kaporo',
          description: 'Forage pour le quartier.',
        })
        .expect(201)
    ).body as ProjectBody;
    const P = (path = '') => url(`/${project.id}${path}`);
    const get = async (auth: Auth = member.auth) =>
      (await http().get(P()).set(auth).expect(200)).body as ProjectBody;

    return {
      president,
      treasurer,
      auditor,
      member,
      group,
      project,
      P,
      get,
      membershipOf,
      generalCashbox: group.cashboxes.find((c) => c.kind === 'GENERAL')!.id,
    };
  }

  async function budgetAndApprove(s: Awaited<ReturnType<typeof setup>>) {
    await http()
      .put(s.P('/budget'))
      .set(s.president.auth)
      .send({
        lines: [
          { label: 'Forage', amount: '2000000' },
          { label: 'Pompe', amount: '1000000' },
        ],
        allocatedFunds: '400000',
        subsidies: '200000',
      })
      .expect(200);
    await http().post(s.P('/approve')).set(s.president.auth).expect(200);
  }

  it('parcours complet : proposé → budgétisé → validé → collecte → réalisation → achevé', async () => {
    const s = await setup();
    expect(s.project.status).toBe('PROPOSED');

    // 2. Budget : 3 000 000 − 400 000 affectés − 200 000 de subventions = 2 400 000.
    const budgeted = (
      await http()
        .put(s.P('/budget'))
        .set(s.president.auth)
        .send({
          lines: [
            { label: 'Forage', amount: '2000000' },
            { label: 'Pompe', amount: '1000000' },
          ],
          allocatedFunds: '400000',
          subsidies: '200000',
        })
        .expect(200)
    ).body as ProjectBody;
    expect(budgeted).toMatchObject({
      status: 'BUDGETED',
      targetAmount: '2400000',
    });
    expect(budgeted.budget.total).toBe('3000000');

    // 3. Validation par le président.
    await http().post(s.P('/approve')).set(s.president.auth).expect(200);

    // 4. Collecte : part proposée = 2 400 000 ÷ 4 membres = 600 000, en 3 versements mensuels.
    sms.sent.length = 0;
    const opened = (
      await http()
        .post(s.P('/collection'))
        .set(s.president.auth)
        .send({
          mode: 'PER_MEMBER',
          installments: 3,
          firstDueDate: '2027-02-01',
        })
        .expect(200)
    ).body as ProjectBody;
    expect(opened.status).toBe('COLLECTING');
    expect(opened.plan).toMatchObject({
      amountPerMember: '600000',
      memberCount: 4,
    });
    expect(opened.plan!.installments).toEqual([
      { dueDate: '2027-02-01', amount: '200000' },
      { dueDate: '2027-03-01', amount: '200000' },
      { dueDate: '2027-04-01', amount: '200000' },
    ]);
    // Les 3 autres membres sont prévenus par SMS.
    expect(sms.sent).toHaveLength(3);
    expect(sms.sent[0].message).toContain('votre part 600 000 GNF');

    // Le trésorier encaisse une part et un don extérieur.
    await http()
      .post(`/groups/${s.group.id}/payments/cash`)
      .set(s.treasurer.auth)
      .send({
        membershipId: s.membershipOf('Alpha Barry'),
        planId: opened.plan!.planId,
        amount: '600000',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const donation = await http()
      .post(`/groups/${s.group.id}/donations`)
      .set(s.treasurer.auth)
      .send({
        cashboxId: s.project.cashboxId,
        amount: '1500000',
        donorName: 'Diaspora de Paris',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    expect((donation.body as { receiptNumber: string }).receiptNumber).toMatch(
      /^R-[0-9A-F]{8}-\d{6}$/,
    );

    let report = await s.get();
    expect(report.collection).toMatchObject({
      collected: '2100000',
      progress: 87,
    });
    expect(report.contributors).toEqual([
      { name: 'Diaspora de Paris', amount: '1500000' },
      { name: 'Alpha Barry', amount: '600000' },
    ]);

    // 5. Réalisation : dépenses rattachées aux postes, jalon avec photo.
    await http().post(s.P('/start')).set(s.president.auth).expect(200);
    const forage = report.budget.lines.find((l) => l.label === 'Forage')!;
    await http()
      .post(`/groups/${s.group.id}/expenses`)
      .set(s.treasurer.auth)
      .send({
        cashboxId: s.project.cashboxId,
        budgetLineId: forage.id,
        amount: '700000',
        category: 'travaux',
        label: 'Acompte foreur',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    await http()
      .post(s.P('/updates'))
      .set(s.president.auth)
      .send({
        title: 'Forage à 40 m',
        photoUrl: 'https://exemple.org/puits/forage.jpg',
      })
      .expect(201);

    report = await s.get();
    expect(report.budget.lines.find((l) => l.label === 'Forage')).toMatchObject(
      {
        planned: '2000000',
        spent: '700000',
        overrun: false,
      },
    );
    expect(report.updates.map((u) => u.title)).toEqual(['Forage à 40 m']);

    // 6. Achèvement : le reliquat (2 100 000 − 700 000) retourne à la caisse générale (RG-D4).
    const done = (
      await http()
        .post(s.P('/complete'))
        .set(s.president.auth)
        .send({})
        .expect(200)
    ).body as ProjectBody;
    expect(done.status).toBe('COMPLETED');
    expect(done.collection).toMatchObject({
      collected: '2100000',
      spent: '700000',
      transferredOut: '1400000',
      balance: '0',
    });
    const boxes = (
      await http()
        .get(`/groups/${s.group.id}/cashboxes`)
        .set(s.member.auth)
        .expect(200)
    ).body as { id: string; balance: string }[];
    expect(boxes.find((b) => b.id === s.generalCashbox)!.balance).toBe(
      '1400000',
    );
  });

  it('refuse de sauter une étape et de modifier le budget après validation', async () => {
    const s = await setup();
    await http().post(s.P('/approve')).set(s.president.auth).expect(409);
    await budgetAndApprove(s);
    await http()
      .put(s.P('/budget'))
      .set(s.president.auth)
      .send({ lines: [{ label: 'Forage', amount: '1' }] })
      .expect(409);
  });

  it('pas de dépense sur la caisse d’un projet avant la collecte', async () => {
    const s = await setup();
    await http()
      .post(`/groups/${s.group.id}/expenses`)
      .set(s.treasurer.auth)
      .send({
        cashboxId: s.project.cashboxId,
        amount: '1000',
        category: 'test',
        label: 'Trop tôt',
        idempotencyKey: randomUUID(),
      })
      .expect(409);
  });

  it('alerte de dépassement au-delà de 10 % du poste', async () => {
    const s = await setup();
    await budgetAndApprove(s);
    await http()
      .post(s.P('/collection'))
      .set(s.president.auth)
      .send({ mode: 'FREE' })
      .expect(200);
    await http()
      .post(`/groups/${s.group.id}/donations`)
      .set(s.treasurer.auth)
      .send({
        cashboxId: s.project.cashboxId,
        amount: '5000000',
        donorName: 'Mairie',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const pompe = (await s.get()).budget.lines.find(
      (l) => l.label === 'Pompe',
    )!;
    await http()
      .post(`/groups/${s.group.id}/expenses`)
      .set(s.treasurer.auth)
      .send({
        cashboxId: s.project.cashboxId,
        budgetLineId: pompe.id,
        amount: '700000', // sous le seuil de 750 000 : exécutée
        category: 'matériel',
        label: 'Pompe',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    await http()
      .post(`/groups/${s.group.id}/expenses`)
      .set(s.treasurer.auth)
      .send({
        cashboxId: s.project.cashboxId,
        budgetLineId: pompe.id,
        amount: '450000',
        category: 'matériel',
        label: 'Tuyaux supplémentaires',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const line = (await s.get()).budget.lines.find((l) => l.label === 'Pompe')!;
    expect(line).toMatchObject({ spent: '1150000', overrun: true });
  });

  it('un simple membre ne propose pas de projet ; un projet peut être annulé avant la collecte', async () => {
    const s = await setup();
    await http()
      .post(`/groups/${s.group.id}/projects`)
      .set(s.member.auth)
      .send({ title: 'Mon projet', description: 'Test' })
      .expect(403);
    const cancelled = (
      await http()
        .post(s.P('/cancel'))
        .set(s.president.auth)
        .send({ reason: 'Financé par la mairie finalement.' })
        .expect(200)
    ).body as ProjectBody;
    expect(cancelled.status).toBe('CANCELLED');
  });
});
