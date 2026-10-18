import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, FakeSmsSender, signUp } from './helpers';

type Auth = { Authorization: string };
interface ExpenseBody {
  id: string;
  status: string;
  toJustify: boolean;
  approvedById: string | null;
}
interface JournalBody {
  balance: string;
  entries: {
    direction: string;
    amount: string;
    category: string;
    balanceAfter: string;
    reversalOfId: string | null;
  }[];
}

describe('Dépenses, double validation, journal et audit (e2e)', () => {
  let app: INestApplication<App>;
  let sms: FakeSmsSender;

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /**
   * Famille en GNF (seuil par défaut : 750 000) avec président, trésorier et
   * contrôleur ; la caisse générale reçoit 1 000 000 GNF de cotisations.
   */
  async function setup() {
    const president = await signUp(app, sms, 'Elhadj Diallo');
    const treasurer = await signUp(app, sms, 'Ibrahima Sow');
    const auditor = await signUp(app, sms, 'Mariama Baldé');
    const group = (
      await http()
        .post('/groups')
        .set(president.auth)
        .send({ type: 'COMMUNITY', name: 'Association de Labé' })
        .expect(201)
    ).body as { id: string; cashboxes: { id: string; kind: string }[] };
    const general = group.cashboxes.find((c) => c.kind === 'GENERAL')!.id;

    for (const [user, role] of [
      [treasurer, 'TREASURER'],
      [auditor, 'AUDITOR'],
    ] as const) {
      await http()
        .post(`/groups/${group.id}/members`)
        .set(president.auth)
        .send({ phone: user.user.phone, role })
        .expect(201);
      await http().post(`/groups/${group.id}/join`).set(user.auth).expect(200);
    }

    const plan = (
      await http()
        .post(`/groups/${group.id}/plans`)
        .set(president.auth)
        .send({
          name: 'Puits du village',
          amount: '1000000',
          startDate: '2027-01-10',
        })
        .expect(201)
    ).body as { id: string };
    const members = (
      await http()
        .get(`/groups/${group.id}/members`)
        .set(president.auth)
        .expect(200)
    ).body as { membershipId: string; role: string }[];
    await http()
      .post(`/groups/${group.id}/payments/cash`)
      .set(treasurer.auth)
      .send({
        membershipId: members.find((m) => m.role === 'PRESIDENT')!.membershipId,
        planId: plan.id,
        amount: '1000000',
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const spend = (
      amount: string,
      extra: object = {},
      status: number | null = 201,
    ) => {
      const req = http()
        .post(`/groups/${group.id}/expenses`)
        .set(treasurer.auth)
        .send({
          cashboxId: general,
          amount,
          category: 'matériaux',
          label: 'Ciment pour le puits',
          idempotencyKey: randomUUID(),
          ...extra,
        });
      return status === null ? req : req.expect(status);
    };

    const journal = async (auth: Auth = president.auth) =>
      (
        await http()
          .get(`/groups/${group.id}/cashboxes/${general}/movements`)
          .set(auth)
          .expect(200)
      ).body as JournalBody;

    return { president, treasurer, auditor, group, general, spend, journal };
  }

  describe('RG-D1 : seuil de double validation', () => {
    it('sous le seuil, la dépense sort tout de suite de la caisse', async () => {
      const { spend, journal } = await setup();
      const expense = (await spend('200000')).body as ExpenseBody;
      expect(expense.status).toBe('EXECUTED');
      expect((await journal()).balance).toBe('800000');
    });

    it('au-delà du seuil, elle attend le contrôleur avant de sortir', async () => {
      const { spend, journal, group, auditor } = await setup();
      const expense = (await spend('800000')).body as ExpenseBody;
      expect(expense.status).toBe('PENDING_APPROVAL');
      expect((await journal()).balance).toBe('1000000');

      const approved = await http()
        .post(`/groups/${group.id}/expenses/${expense.id}/approve`)
        .set(auditor.auth)
        .expect(200);
      expect((approved.body as ExpenseBody).status).toBe('EXECUTED');
      expect((approved.body as ExpenseBody).approvedById).toBe(auditor.user.id);
      expect((await journal()).balance).toBe('200000');

      // Une seconde validation est refusée.
      await http()
        .post(`/groups/${group.id}/expenses/${expense.id}/approve`)
        .set(auditor.auth)
        .expect(409);
    });

    it('le trésorier ne peut pas valider sa propre dépense', async () => {
      const { spend, group, treasurer } = await setup();
      const expense = (await spend('800000')).body as ExpenseBody;
      await http()
        .post(`/groups/${group.id}/expenses/${expense.id}/approve`)
        .set(treasurer.auth)
        .expect(403);
    });

    it('le président peut refuser, avec un motif', async () => {
      const { spend, group, president, journal } = await setup();
      const expense = (await spend('900000')).body as ExpenseBody;
      const rejected = await http()
        .post(`/groups/${group.id}/expenses/${expense.id}/reject`)
        .set(president.auth)
        .send({ reason: 'Devis trop élevé, demander un second devis.' })
        .expect(200);
      expect((rejected.body as ExpenseBody).status).toBe('REJECTED');
      expect((await journal()).balance).toBe('1000000');
    });

    it('le président peut changer le seuil du groupe', async () => {
      const { president, group, spend } = await setup();
      const rules = await http()
        .patch(`/groups/${group.id}/rules`)
        .set(president.auth)
        .send({ expenseApprovalThreshold: '100000', graceDays: 5 })
        .expect(200);
      expect(rules.body).toEqual({
        graceDays: 5,
        expenseApprovalThreshold: '100000',
        penaltyMode: 'NONE',
        penaltyValue: '0',
        lateAlertThreshold: 3,
      });
      const expense = (await spend('150000')).body as ExpenseBody;
      expect(expense.status).toBe('PENDING_APPROVAL');
    });

    it('un trésorier ne peut pas changer les règles', async () => {
      const { treasurer, group } = await setup();
      await http()
        .patch(`/groups/${group.id}/rules`)
        .set(treasurer.auth)
        .send({ expenseApprovalThreshold: '999999999' })
        .expect(403);
    });
  });

  describe('solde', () => {
    it('refuse une dépense supérieure au solde', async () => {
      const { spend } = await setup();
      await spend('1000001', {}, 400);
    });

    it('refuse la validation si la caisse a été vidée entre-temps', async () => {
      const { spend, group, auditor } = await setup();
      const big = (await spend('800000')).body as ExpenseBody;
      await spend('700000'); // sous le seuil : exécutée tout de suite
      await http()
        .post(`/groups/${group.id}/expenses/${big.id}/approve`)
        .set(auditor.auth)
        .expect(400);
    });

    it('deux dépenses simultanées ne mettent jamais la caisse à découvert', async () => {
      const { spend, journal } = await setup();
      const responses = await Promise.all([
        spend('600000', {}, null),
        spend('600000', {}, null),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
      expect((await journal()).balance).toBe('400000');
    });
  });

  describe('justificatifs et annulation', () => {
    it('RG-D2 : une dépense sans justificatif est « à justifier » jusqu’à l’ajout de la facture', async () => {
      const { spend, group, treasurer } = await setup();
      const expense = (await spend('50000')).body as ExpenseBody;
      expect(expense.toJustify).toBe(true);

      const justified = await http()
        .post(`/groups/${group.id}/expenses/${expense.id}/justification`)
        .set(treasurer.auth)
        .send({ justificationUrl: 'https://exemple.org/factures/ciment.jpg' })
        .expect(200);
      expect((justified.body as ExpenseBody).toJustify).toBe(false);
    });

    it('RG-C4 : une dépense s’annule par contre-écriture, visible dans le journal', async () => {
      const { spend, group, treasurer, journal } = await setup();
      const expense = (await spend('200000')).body as ExpenseBody;
      await http()
        .post(`/groups/${group.id}/expenses/${expense.id}/reverse`)
        .set(treasurer.auth)
        .send({ reason: 'Achat annulé, ciment rendu au fournisseur.' })
        .expect(200);

      const j = await journal();
      expect(j.balance).toBe('1000000');
      expect(
        j.entries.map((e) => [e.direction, e.category, e.balanceAfter]),
      ).toEqual([
        ['IN', 'contribution', '1000000'],
        ['OUT', 'matériaux', '800000'],
        ['IN', 'reversal', '1000000'],
      ]);
      expect(j.entries[2].reversalOfId).toBeTruthy();
    });
  });

  describe('journal d’audit', () => {
    it('le bureau consulte l’audit ; un simple membre non', async () => {
      const { president, group, spend } = await setup();
      await spend('10000');
      const res = await http()
        .get(`/groups/${group.id}/audit?limit=3`)
        .set(president.auth)
        .expect(200);
      const actions = (res.body as { action: string }[]).map((e) => e.action);
      expect(actions[0]).toBe('expense.executed');
      expect(actions).toHaveLength(3);

      const member = await signUp(app, sms, 'Simple membre');
      await http()
        .post(`/groups/${group.id}/members`)
        .set(president.auth)
        .send({ phone: member.user.phone })
        .expect(201);
      await http()
        .post(`/groups/${group.id}/join`)
        .set(member.auth)
        .expect(200);
      await http()
        .get(`/groups/${group.id}/audit`)
        .set(member.auth)
        .expect(403);
      // …mais il voit le journal de caisse (transparence).
      await http()
        .get(`/groups/${group.id}/cashboxes`)
        .set(member.auth)
        .expect(200);
    });
  });
});
