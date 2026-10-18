import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, FakeSmsSender, signUp } from './helpers';

type Auth = { Authorization: string };
interface DueBody {
  id: string;
  membershipId: string;
  dueDate: string;
  amountDue: string;
  amountPaid: string;
  status: string;
}
interface ReceiptBody {
  id: string;
  receiptNumber: string;
  amount: string;
  status: string;
  member: { fullName: string };
  allocations: { dueDate: string; amount: string }[];
}
interface CashboxBody {
  kind: string;
  balance: string;
  totalIn: string;
  totalOut: string;
}

describe('Cotisations, paiements en espèces et reçus (e2e)', () => {
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

  /** Famille avec président, trésorier et un membre ; cotisation de 50 000 GNF par mois sur 3 mois. */
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

    const join = async (
      user: { user: { phone: string }; auth: Auth },
      role: string,
    ) => {
      const m = (
        await http()
          .post(`/groups/${group.id}/members`)
          .set(president.auth)
          .send({ phone: user.user.phone, role })
          .expect(201)
      ).body as { membershipId: string };
      await http().post(`/groups/${group.id}/join`).set(user.auth).expect(200);
      return m.membershipId;
    };
    const treasurerMembershipId = await join(treasurer, 'TREASURER');
    const memberMembershipId = await join(member, 'MEMBER');

    const plan = (
      await http()
        .post(`/groups/${group.id}/plans`)
        .set(president.auth)
        .send({
          name: 'Cotisation mensuelle',
          amount: '50000',
          periodicity: 'MONTHLY',
          startDate: '2027-01-05',
          endDate: '2027-03-31',
        })
        .expect(201)
    ).body as { id: string; dueDatesPerMember: number; memberCount: number };

    const pay = (
      amount: string,
      key = randomUUID(),
      status: number | null = 201,
    ) => {
      const req = http()
        .post(`/groups/${group.id}/payments/cash`)
        .set(treasurer.auth)
        .send({
          membershipId: memberMembershipId,
          planId: plan.id,
          amount,
          idempotencyKey: key,
        });
      return status === null ? req : req.expect(status);
    };

    const memberDues = async () =>
      (
        await http()
          .get(`/groups/${group.id}/dues?membershipId=${memberMembershipId}`)
          .set(member.auth)
          .expect(200)
      ).body as DueBody[];

    const generalCashbox = async () =>
      (
        (
          await http()
            .get(`/groups/${group.id}/cashboxes`)
            .set(member.auth)
            .expect(200)
        ).body as CashboxBody[]
      ).find((c) => c.kind === 'GENERAL')!;

    return {
      president,
      treasurer,
      member,
      group,
      plan,
      treasurerMembershipId,
      memberMembershipId,
      pay,
      memberDues,
      generalCashbox,
    };
  }

  describe('cotisations', () => {
    it('génère 3 échéances mensuelles pour chacun des 3 membres actifs', async () => {
      const { plan, memberDues } = await setup();
      expect(plan).toMatchObject({ dueDatesPerMember: 3, memberCount: 3 });
      const dues = await memberDues();
      expect(dues.map((d) => d.dueDate)).toEqual([
        '2027-01-05',
        '2027-02-05',
        '2027-03-05',
      ]);
      expect(dues.every((d) => d.amountDue === '50000')).toBe(true);
    });

    it('cotisation ponctuelle (événement) : une seule échéance', async () => {
      const { president, group } = await setup();
      const res = await http()
        .post(`/groups/${group.id}/plans`)
        .set(president.auth)
        .send({
          name: 'Mariage de Fatou',
          amount: '100000',
          startDate: '2027-06-01',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        dueDatesPerMember: 1,
        periodicity: null,
      });
    });

    it('seul le président crée une cotisation', async () => {
      const { treasurer, group } = await setup();
      await http()
        .post(`/groups/${group.id}/plans`)
        .set(treasurer.auth)
        .send({ name: 'Test', amount: '1000', startDate: '2027-06-01' })
        .expect(403);
    });

    it('refuse un montant à virgule et une récurrence sans fin', async () => {
      const { president, group } = await setup();
      const send = (body: object) =>
        http().post(`/groups/${group.id}/plans`).set(president.auth).send(body);
      await send({
        name: 'Test',
        amount: '1500.5',
        startDate: '2027-06-01',
      }).expect(400);
      await send({
        name: 'Test',
        amount: '1000',
        periodicity: 'MONTHLY',
        startDate: '2027-06-01',
      }).expect(400);
    });

    it('les échéances passées non payées apparaissent en retard', async () => {
      const { president, group, memberMembershipId } = await setup();
      await http()
        .post(`/groups/${group.id}/plans`)
        .set(president.auth)
        .send({
          name: 'Ancienne cotisation',
          amount: '1000',
          startDate: '2020-01-01',
        })
        .expect(201);
      const res = await http()
        .get(`/groups/${group.id}/me/dues`)
        .set(president.auth)
        .expect(200);
      const body = res.body as { lateCount: number; outstanding: string };
      expect(body.lateCount).toBe(1);
      expect(body.outstanding).toBe('151000');
      expect(memberMembershipId).toBeDefined();
    });
  });

  describe('paiement en espèces', () => {
    it('RG-C2 : 70 000 GNF soldent janvier puis 20 000 sur février ; reçu numéroté', async () => {
      const { pay, memberDues, generalCashbox } = await setup();
      const receipt = (await pay('70000')).body as ReceiptBody;

      expect(receipt).toMatchObject({
        amount: '70000',
        status: 'PENDING_CONFIRMATION',
        member: { fullName: 'Aïssatou Bah' },
      });
      expect(receipt.receiptNumber).toMatch(/^R-[0-9A-F]{8}-000001$/);
      expect(
        receipt.allocations.map(({ dueDate, amount }) => ({ dueDate, amount })),
      ).toEqual([
        { dueDate: '2027-01-05', amount: '50000' },
        { dueDate: '2027-02-05', amount: '20000' },
      ]);

      const dues = await memberDues();
      expect(dues.map((d) => [d.amountPaid, d.status])).toEqual([
        ['50000', 'PAID'],
        ['20000', 'PARTIAL'],
        ['0', 'PENDING'],
      ]);
      expect((await generalCashbox()).balance).toBe('70000');

      const second = (await pay('30000')).body as ReceiptBody;
      expect(second.receiptNumber).toMatch(/-000002$/);
    });

    it('une saisie renvoyée deux fois (réseau coupé) ne crée pas de doublon', async () => {
      const { pay, generalCashbox } = await setup();
      const key = randomUUID();
      const first = (await pay('50000', key)).body as ReceiptBody;
      const again = (await pay('50000', key)).body as ReceiptBody;
      expect(again.id).toBe(first.id);
      expect((await generalCashbox()).balance).toBe('50000');
      await pay('40000', key, 409); // même clé, autre montant
    });

    it('refuse un montant supérieur au reste à payer', async () => {
      const { pay } = await setup();
      await pay('150001', randomUUID(), 400);
    });

    it('seul le trésorier saisit un paiement', async () => {
      const { president, group, plan, memberMembershipId } = await setup();
      await http()
        .post(`/groups/${group.id}/payments/cash`)
        .set(president.auth)
        .send({
          membershipId: memberMembershipId,
          planId: plan.id,
          amount: '1000',
          idempotencyKey: randomUUID(),
        })
        .expect(403);
    });

    it('deux saisies simultanées ne dépassent jamais le reste à payer', async () => {
      const { pay, memberDues } = await setup();
      const results = await Promise.allSettled([
        pay('100000', randomUUID(), null),
        pay('100000', randomUUID(), null),
      ]);
      const statuses = results.map((r) =>
        r.status === 'fulfilled' ? r.value.status : 0,
      );
      expect(statuses.sort()).toEqual([201, 400]);
      const paid = (await memberDues()).reduce(
        (sum, d) => sum + Number(d.amountPaid),
        0,
      );
      expect(paid).toBe(100000);
    });
  });

  describe('confirmation, contestation, annulation', () => {
    it('RG-C1 : le membre confirme son paiement', async () => {
      const { pay, member, group } = await setup();
      const receipt = (await pay('50000')).body as ReceiptBody;
      const res = await http()
        .post(`/groups/${group.id}/payments/${receipt.id}/confirm`)
        .set(member.auth)
        .expect(200);
      expect((res.body as ReceiptBody).status).toBe('CONFIRMED');
      // Plus rien à confirmer ensuite.
      await http()
        .post(`/groups/${group.id}/payments/${receipt.id}/confirm`)
        .set(member.auth)
        .expect(409);
    });

    it('un autre membre ne peut pas confirmer à la place du payeur', async () => {
      const { pay, president, group } = await setup();
      const receipt = (await pay('50000')).body as ReceiptBody;
      await http()
        .post(`/groups/${group.id}/payments/${receipt.id}/confirm`)
        .set(president.auth)
        .expect(403);
    });

    it('le membre conteste ; le trésorier annule par contre-écriture (RG-C4)', async () => {
      const { pay, member, treasurer, group, memberDues, generalCashbox } =
        await setup();
      const receipt = (await pay('70000')).body as ReceiptBody;

      const disputed = await http()
        .post(`/groups/${group.id}/payments/${receipt.id}/dispute`)
        .set(member.auth)
        .send({ reason: "J'ai remis 50 000, pas 70 000." })
        .expect(200);
      expect((disputed.body as ReceiptBody).status).toBe('DISPUTED');

      const reversed = await http()
        .post(`/groups/${group.id}/payments/${receipt.id}/reverse`)
        .set(treasurer.auth)
        .send({ reason: 'Erreur de saisie, montant réel 50 000.' })
        .expect(200);
      expect((reversed.body as ReceiptBody).status).toBe('REVERSED');

      // Les échéances sont rouvertes et la caisse revient à zéro…
      const dues = await memberDues();
      expect(
        dues.every((d) => d.amountPaid === '0' && d.status === 'PENDING'),
      ).toBe(true);
      const box = await generalCashbox();
      expect(box).toMatchObject({
        totalIn: '70000',
        totalOut: '70000',
        balance: '0',
      });

      // …mais rien n'a été effacé : l'écriture d'origine et sa contre-écriture restent.
      const movements = await prisma.movement.findMany({
        where: { cashbox: { groupId: group.id } },
        orderBy: { createdAt: 'asc' },
      });
      expect(movements.map((m) => [m.direction, m.category])).toEqual([
        ['IN', 'contribution'],
        ['OUT', 'reversal'],
      ]);
      expect(movements[1].reversalOfId).toBe(movements[0].id);

      // Le bon montant est ensuite ressaisi normalement.
      await pay('50000');
      expect((await generalCashbox()).balance).toBe('50000');
      await http()
        .post(`/groups/${group.id}/payments/${receipt.id}/reverse`)
        .set(treasurer.auth)
        .send({ reason: 'Deuxième annulation' })
        .expect(409);
    });

    it('RG-C3 : le président exonère une échéance avec un motif', async () => {
      const { president, group, memberDues } = await setup();
      const [first] = await memberDues();
      await http()
        .post(`/groups/${group.id}/dues/${first.id}/exempt`)
        .set(president.auth)
        .send({ reason: 'Hospitalisée en janvier' })
        .expect(200);
      const dues = await memberDues();
      expect(dues[0].status).toBe('EXEMPT');
    });
  });
});
