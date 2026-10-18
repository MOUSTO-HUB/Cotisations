import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, FakeSmsSender, signUp } from './helpers';

type Auth = { Authorization: string };
interface CycleBody {
  id: string;
  status: string;
  potAmount: string;
  shareCount: number;
  draw: { drawnAt: string; order: string[] } | null;
  shares: {
    id: string;
    membershipId: string;
    memberName: string;
    turn: number | null;
  }[];
  rounds: {
    number: number;
    dueDate: string;
    potAmount: string;
    beneficiary: { membershipId: string; memberName: string } | null;
    status: string;
    collected: string;
    paidShares: number;
    totalShares: number;
    unpaidMembers: string[];
    receiptConfirmed: boolean;
  }[];
  members: {
    memberName: string;
    parts: number;
    lateDueCount: number;
    hasReceivedPot: boolean;
    defaulter: boolean;
  }[];
  swaps: { id: string; status: string; rounds: number[] }[];
}

describe('Tontine rotative (e2e)', () => {
  let app: INestApplication<App>;
  let sms: FakeSmsSender;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /**
   * Tontine du marché : présidente, trésorier, Aïssatou (2 parts) et Binta.
   * 100 000 GNF par part et par mois → 5 parts, pot de 500 000 GNF.
   */
  async function setup(startDate = '2027-01-05', orderMode = 'FIXED') {
    const president = await signUp(app, sms, 'Hadja Kadiatou');
    const treasurer = await signUp(app, sms, 'Ibrahima Sow');
    const aissatou = await signUp(app, sms, 'Aïssatou Bah');
    const binta = await signUp(app, sms, 'Binta Camara');
    const group = (
      await http()
        .post('/groups')
        .set(president.auth)
        .send({ type: 'TONTINE', name: 'Tontine du marché Madina' })
        .expect(201)
    ).body as { id: string };
    for (const [user, role] of [
      [treasurer, 'TREASURER'],
      [aissatou, 'MEMBER'],
      [binta, 'MEMBER'],
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
    const m = (name: string) =>
      members.find((x) => x.fullName === name)!.membershipId;

    const cycle = (
      await http()
        .post(`/groups/${group.id}/tontines`)
        .set(president.auth)
        .send({
          name: 'Cycle 2027',
          contributionAmount: '100000',
          periodicity: 'MONTHLY',
          startDate,
          orderMode,
        })
        .expect(201)
    ).body as CycleBody;
    const C = (path = '') => `/groups/${group.id}/tontines/${cycle.id}${path}`;

    const withShares = (
      await http()
        .put(C('/shares'))
        .set(president.auth)
        .send({
          members: [
            { membershipId: m('Hadja Kadiatou') },
            { membershipId: m('Ibrahima Sow') },
            { membershipId: m('Aïssatou Bah'), parts: 2 },
            { membershipId: m('Binta Camara') },
          ],
        })
        .expect(200)
    ).body as CycleBody;

    const get = async (auth: Auth = binta.auth) =>
      (await http().get(C()).set(auth).expect(200)).body as CycleBody;
    const pay = (round: number, membershipId: string, status = 201) =>
      http()
        .post(C(`/rounds/${round}/payments`))
        .set(treasurer.auth)
        .send({ membershipId, idempotencyKey: randomUUID() })
        .expect(status);
    const payAll = async (round: number) => {
      for (const name of [
        'Hadja Kadiatou',
        'Ibrahima Sow',
        'Aïssatou Bah',
        'Binta Camara',
      ]) {
        await pay(round, m(name));
      }
    };
    const authOf = (name: string) =>
      ({
        'Hadja Kadiatou': president.auth,
        'Ibrahima Sow': treasurer.auth,
        'Aïssatou Bah': aissatou.auth,
        'Binta Camara': binta.auth,
      })[name]!;

    return {
      president,
      treasurer,
      aissatou,
      binta,
      group,
      cycle,
      withShares,
      C,
      get,
      pay,
      payAll,
      m,
      authOf,
    };
  }

  /** Ordre fixé : Binta, Aïssatou, Hadja, Aïssatou (2e part), Ibrahima. */
  async function fixOrderAndStart(s: Awaited<ReturnType<typeof setup>>) {
    const byName = (name: string) =>
      s.withShares.shares.filter((x) => x.memberName === name).map((x) => x.id);
    const [a1, a2] = byName('Aïssatou Bah');
    await http()
      .put(s.C('/order'))
      .set(s.president.auth)
      .send({
        shareIds: [
          byName('Binta Camara')[0],
          a1,
          byName('Hadja Kadiatou')[0],
          a2,
          byName('Ibrahima Sow')[0],
        ],
      })
      .expect(200);
    return (await http().post(s.C('/start')).set(s.president.auth).expect(200))
      .body as CycleBody;
  }

  it('cycle complet : 5 parts, pot de 500 000 GNF, versement après tour complet et confirmation', async () => {
    const s = await setup();
    expect(s.withShares.shareCount).toBe(5);

    sms.sent.length = 0;
    const started = await fixOrderAndStart(s);
    expect(started.status).toBe('ACTIVE');
    expect(started.potAmount).toBe('500000');
    expect(
      started.rounds.map((r) => [
        r.number,
        r.dueDate,
        r.beneficiary!.memberName,
      ]),
    ).toEqual([
      [1, '2027-01-05', 'Binta Camara'],
      [2, '2027-02-05', 'Aïssatou Bah'],
      [3, '2027-03-05', 'Hadja Kadiatou'],
      [4, '2027-04-05', 'Aïssatou Bah'],
      [5, '2027-05-05', 'Ibrahima Sow'],
    ]);
    expect(sms.sent).toHaveLength(3); // tous sauf la présidente
    expect(sms.sent[0].message).toContain('pot de 500 000 GNF');

    // Tour 1 : Aïssatou verse pour ses 2 parts en une fois.
    const receipt = (await s.pay(1, s.m('Aïssatou Bah'))).body as {
      amount: string;
      status: string;
    };
    expect(receipt).toMatchObject({
      amount: '200000',
      status: 'PENDING_CONFIRMATION',
    });
    await s.pay(1, s.m('Aïssatou Bah'), 409); // rien de plus à verser pour ce tour

    // RG-T2 : pas de versement du pot tant que le tour n'est pas complet.
    await http()
      .post(s.C('/rounds/1/payout'))
      .set(s.treasurer.auth)
      .expect(409);
    let view = await s.get();
    expect(view.rounds[0]).toMatchObject({
      status: 'COLLECTING',
      collected: '200000',
      paidShares: 2,
      totalShares: 5,
    });
    expect(view.rounds[0].unpaidMembers.sort()).toEqual([
      'Binta Camara',
      'Hadja Kadiatou',
      'Ibrahima Sow',
    ]);

    for (const name of ['Hadja Kadiatou', 'Ibrahima Sow', 'Binta Camara']) {
      await s.pay(1, s.m(name));
    }
    view = await s.get();
    expect(view.rounds[0].status).toBe('COMPLETE');

    sms.sent.length = 0;
    await http()
      .post(s.C('/rounds/1/payout'))
      .set(s.treasurer.auth)
      .expect(200);
    expect(sms.sent[0].message).toContain('(500 000 GNF) vous a été remis');
    await http()
      .post(s.C('/rounds/1/payout'))
      .set(s.treasurer.auth)
      .expect(409);

    // Seule la bénéficiaire confirme la réception.
    await http()
      .post(s.C('/rounds/1/confirm-receipt'))
      .set(s.aissatou.auth)
      .expect(403);
    await http()
      .post(s.C('/rounds/1/confirm-receipt'))
      .set(s.binta.auth)
      .expect(200);

    // Tours 2 à 5.
    for (const round of [2, 3, 4, 5]) {
      await s.payAll(round);
      await http()
        .post(s.C(`/rounds/${round}/payout`))
        .set(s.treasurer.auth)
        .expect(200);
      const beneficiary = view.rounds[round - 1].beneficiary!.memberName;
      await http()
        .post(s.C(`/rounds/${round}/confirm-receipt`))
        .set(s.authOf(beneficiary))
        .expect(200);
    }
    view = await s.get();
    expect(view.status).toBe('COMPLETED');
    expect(
      view.rounds.every((r) => r.status === 'PAID_OUT' && r.receiptConfirmed),
    ).toBe(true);

    // La caisse de la tontine revient à zéro : tout ce qui est entré est ressorti en pots.
    const boxes = (
      await http()
        .get(`/groups/${s.group.id}/cashboxes`)
        .set(s.binta.auth)
        .expect(200)
    ).body as {
      kind: string;
      totalIn: string;
      totalOut: string;
      balance: string;
    }[];
    expect(boxes.find((b) => b.kind === 'TONTINE')).toMatchObject({
      totalIn: '2500000',
      totalOut: '2500000',
      balance: '0',
    });
  });

  it('RG-T4 : tirage au sort par le serveur, archivé, impossible à relancer', async () => {
    const s = await setup('2027-01-05', 'DRAW');
    const drawn = (
      await http().post(s.C('/draw')).set(s.president.auth).expect(200)
    ).body as CycleBody;
    expect(drawn.draw!.order).toHaveLength(5);
    expect(new Set(drawn.shares.map((x) => x.turn))).toEqual(
      new Set([1, 2, 3, 4, 5]),
    );

    await http().post(s.C('/draw')).set(s.president.auth).expect(409);
    // Les parts ne peuvent plus changer après le tirage.
    await http()
      .put(s.C('/shares'))
      .set(s.president.auth)
      .send({ members: [{ membershipId: s.m('Binta Camara'), parts: 2 }] })
      .expect(409);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: s.cycle.id, action: 'tontine.drawn' },
    });
    expect((audit?.data as { order: string[] }).order).toEqual(
      drawn.draw!.order,
    );
  });

  it('les paramètres et les parts sont verrouillés une fois la tontine démarrée', async () => {
    const s = await setup();
    await fixOrderAndStart(s);
    await http()
      .put(s.C('/shares'))
      .set(s.president.auth)
      .send({ members: [{ membershipId: s.m('Binta Camara') }] })
      .expect(409);
    await http().post(s.C('/start')).set(s.president.auth).expect(409);
  });

  it('on ne démarre pas sans ordre, et une tontine se crée seulement dans un groupe tontine', async () => {
    const s = await setup();
    await http().post(s.C('/start')).set(s.president.auth).expect(409);

    const family = (
      await http()
        .post('/groups')
        .set(s.president.auth)
        .send({ type: 'FAMILY', name: 'Famille' })
        .expect(201)
    ).body as { id: string };
    await http()
      .post(`/groups/${family.id}/tontines`)
      .set(s.president.auth)
      .send({
        name: 'Test',
        contributionAmount: '1000',
        periodicity: 'WEEKLY',
        startDate: '2027-01-01',
        orderMode: 'DRAW',
      })
      .expect(400);
  });

  it('RG-T3 : une bénéficiaire servie qui ne paie plus est signalée défaillante', async () => {
    const s = await setup('2026-01-05'); // tours passés : les retards sont réels
    await fixOrderAndStart(s);
    await s.payAll(1);
    await http()
      .post(s.C('/rounds/1/payout'))
      .set(s.treasurer.auth)
      .expect(200);
    // Binta (servie au tour 1) ne paie pas le tour 2 ; les autres si.
    for (const name of ['Hadja Kadiatou', 'Ibrahima Sow', 'Aïssatou Bah']) {
      await s.pay(2, s.m(name));
    }
    const view = await s.get(s.president.auth);
    const binta = view.members.find((x) => x.memberName === 'Binta Camara')!;
    expect(binta).toMatchObject({ hasReceivedPot: true, defaulter: true });
    expect(binta.lateDueCount).toBeGreaterThan(0);
    const hadja = view.members.find((x) => x.memberName === 'Hadja Kadiatou')!;
    expect(hadja.defaulter).toBe(false); // en retard sur les tours suivants, mais pas encore servie
  });

  it('échange de tours : demande, accord de l’autre bénéficiaire, validation du président', async () => {
    const s = await setup();
    await fixOrderAndStart(s);

    // Hadja (tour 3) veut le tour 5 d'Ibrahima.
    const req = (
      await http()
        .post(s.C('/swaps'))
        .set(s.president.auth)
        .send({ myRound: 3, otherRound: 5 })
        .expect(201)
    ).body as { swapId: string };
    // Binta n'est pas concernée et ne peut pas accepter.
    await http()
      .post(s.C(`/swaps/${req.swapId}/accept`))
      .set(s.binta.auth)
      .expect(403);
    await http()
      .post(s.C(`/swaps/${req.swapId}/accept`))
      .set(s.treasurer.auth)
      .expect(200);
    const decided = (
      await http()
        .post(s.C(`/swaps/${req.swapId}/decision`))
        .set(s.president.auth)
        .send({ decision: 'APPROVE' })
        .expect(200)
    ).body as CycleBody;

    expect(
      decided.rounds.find((r) => r.number === 3)!.beneficiary!.memberName,
    ).toBe('Ibrahima Sow');
    expect(
      decided.rounds.find((r) => r.number === 5)!.beneficiary!.memberName,
    ).toBe('Hadja Kadiatou');
    expect(decided.swaps[0]).toMatchObject({
      status: 'APPROVED',
      rounds: [3, 5],
    });
  });

  it('on ne peut pas échanger un tour dont le pot est déjà versé', async () => {
    const s = await setup();
    await fixOrderAndStart(s);
    await s.payAll(1);
    await http()
      .post(s.C('/rounds/1/payout'))
      .set(s.treasurer.auth)
      .expect(200);
    await http()
      .post(s.C('/swaps'))
      .set(s.binta.auth)
      .send({ myRound: 1, otherRound: 2 })
      .expect(409);
  });

  it('un versement de tontine a un reçu, se confirme et s’annule comme une cotisation', async () => {
    const s = await setup();
    await fixOrderAndStart(s);
    const receipt = (await s.pay(1, s.m('Binta Camara'))).body as {
      id: string;
      plan: null;
    };
    expect(receipt.plan).toBeNull();
    await http()
      .post(`/groups/${s.group.id}/payments/${receipt.id}/reverse`)
      .set(s.treasurer.auth)
      .send({ reason: 'Saisie en double avec le carnet.' })
      .expect(200);
    const view = await s.get();
    expect(view.rounds[0]).toMatchObject({ collected: '0', paidShares: 0 });
  });
});
