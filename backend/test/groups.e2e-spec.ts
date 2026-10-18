import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, FakeSmsSender, randomPhone, signUp } from './helpers';

interface GroupBody {
  id: string;
  type: string;
  currency: string;
  timezone: string;
  myRole: string;
  myStatus: string;
  cashboxes: { kind: string; name: string }[];
}
interface MemberBody {
  membershipId: string;
  userId: string;
  fullName: string;
  phone: string;
  role: string;
  status: string;
}

describe('Groupes, membres et rôles (e2e)', () => {
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

  async function createGroup(
    auth: { Authorization: string },
    body: object = { type: 'FAMILY', name: 'Famille Diallo' },
  ) {
    const res = await http().post('/groups').set(auth).send(body).expect(201);
    return res.body as GroupBody;
  }

  async function addMember(
    auth: { Authorization: string },
    groupId: string,
    body: object,
    status = 201,
  ) {
    const res = await http()
      .post(`/groups/${groupId}/members`)
      .set(auth)
      .send(body)
      .expect(status);
    return res.body as MemberBody;
  }

  describe('création', () => {
    it('le créateur devient président ; famille = caisse générale + fonds de solidarité, en GNF', async () => {
      const president = await signUp(app, sms);
      const group = await createGroup(president.auth);
      expect(group).toMatchObject({
        type: 'FAMILY',
        currency: 'GNF',
        timezone: 'Africa/Conakry',
        myRole: 'PRESIDENT',
        myStatus: 'ACTIVE',
      });
      expect(group.cashboxes.map((c) => c.kind).sort()).toEqual([
        'GENERAL',
        'SOLIDARITY',
      ]);

      const audit = await prisma.auditLog.findMany({
        where: { groupId: group.id },
      });
      expect(audit.map((a) => a.action)).toEqual(['group.created']);
    });

    it('une tontine n’a qu’une caisse générale', async () => {
      const president = await signUp(app, sms);
      const group = await createGroup(president.auth, {
        type: 'TONTINE',
        name: 'Tontine du marché Madina',
      });
      expect(group.cashboxes.map((c) => c.kind)).toEqual(['GENERAL']);
    });

    it('un créateur sénégalais obtient le franc CFA par défaut', async () => {
      const president = await signUp(
        app,
        sms,
        'Awa Ndiaye',
        `+22177${String(Date.now()).slice(-7)}`,
      );
      const group = await createGroup(president.auth, {
        type: 'COMMUNITY',
        name: 'Ressortissants de Kolda',
      });
      expect(group).toMatchObject({
        currency: 'XOF',
        timezone: 'Africa/Dakar',
      });
    });

    it('refuse un type de groupe inconnu', async () => {
      const president = await signUp(app, sms);
      await http()
        .post('/groups')
        .set(president.auth)
        .send({ type: 'CLUB', name: 'Test' })
        .expect(400);
    });
  });

  describe('membres', () => {
    it('ajoute directement un membre sans compte (sans smartphone), qui pourra se connecter plus tard', async () => {
      const president = await signUp(app, sms);
      const group = await createGroup(president.auth);
      const phone = randomPhone();

      const noName = await http()
        .post(`/groups/${group.id}/members`)
        .set(president.auth)
        .send({ phone })
        .expect(400);
      expect((noName.body as { code: string }).code).toBe('FULL_NAME_REQUIRED');

      const member = await addMember(president.auth, group.id, {
        phone,
        fullName: 'Grand-père Alpha',
      });
      expect(member).toMatchObject({
        phone: `+224${phone}`,
        role: 'MEMBER',
        status: 'ACTIVE',
      });

      // Plus tard, il se connecte avec son numéro : il retrouve son groupe.
      await http().post('/auth/otp/request').send({ phone }).expect(200);
      const login = await http()
        .post('/auth/otp/verify')
        .send({ phone, code: sms.lastCode() })
        .expect(200);
      const token = (login.body as { token: string }).token;
      const mine = await http()
        .get('/groups')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((mine.body as GroupBody[]).map((g) => g.id)).toContain(group.id);
    });

    it('invite un utilisateur existant, qui accepte l’invitation', async () => {
      const president = await signUp(app, sms);
      const guest = await signUp(app, sms, 'Kadiatou Barry');
      const group = await createGroup(president.auth);

      const invited = await addMember(president.auth, group.id, {
        phone: guest.user.phone,
      });
      expect(invited.status).toBe('INVITED');

      // Invité : voit le groupe, mais pas encore la liste des membres.
      await http().get(`/groups/${group.id}`).set(guest.auth).expect(200);
      await http()
        .get(`/groups/${group.id}/members`)
        .set(guest.auth)
        .expect(404);

      const joined = await http()
        .post(`/groups/${group.id}/join`)
        .set(guest.auth)
        .expect(200);
      expect((joined.body as MemberBody).status).toBe('ACTIVE');

      const members = await http()
        .get(`/groups/${group.id}/members`)
        .set(guest.auth)
        .expect(200);
      expect((members.body as MemberBody[]).map((m) => m.fullName)).toEqual([
        'Mamadou Diallo',
        'Kadiatou Barry',
      ]);
    });

    it('refuse d’ajouter deux fois la même personne', async () => {
      const president = await signUp(app, sms);
      const group = await createGroup(president.auth);
      const phone = randomPhone();
      await addMember(president.auth, group.id, { phone, fullName: 'Test' });
      await addMember(
        president.auth,
        group.id,
        { phone, fullName: 'Test' },
        409,
      );
    });

    it('un non-membre ne voit pas le groupe (404)', async () => {
      const president = await signUp(app, sms);
      const stranger = await signUp(app, sms);
      const group = await createGroup(president.auth);
      await http().get(`/groups/${group.id}`).set(stranger.auth).expect(404);
    });
  });

  describe('rôles (section 3)', () => {
    async function setup() {
      const president = await signUp(app, sms);
      const group = await createGroup(president.auth);
      const treasurerUser = await signUp(app, sms, 'Ibrahima Sow');
      const treasurer = await addMember(president.auth, group.id, {
        phone: treasurerUser.user.phone,
        role: 'TREASURER',
      });
      await http()
        .post(`/groups/${group.id}/join`)
        .set(treasurerUser.auth)
        .expect(200);
      return { president, group, treasurerUser, treasurer };
    }

    it('un trésorier ne peut pas ajouter de membre', async () => {
      const { group, treasurerUser } = await setup();
      await addMember(
        treasurerUser.auth,
        group.id,
        { phone: randomPhone(), fullName: 'Test' },
        403,
      );
    });

    it('un secrétaire ajoute des membres mais ne nomme pas le bureau', async () => {
      const { president, group } = await setup();
      const secretaryUser = await signUp(app, sms);
      await addMember(president.auth, group.id, {
        phone: secretaryUser.user.phone,
        role: 'SECRETARY',
      });
      await http()
        .post(`/groups/${group.id}/join`)
        .set(secretaryUser.auth)
        .expect(200);

      await addMember(secretaryUser.auth, group.id, {
        phone: randomPhone(),
        fullName: 'Nouveau membre',
      });
      await addMember(
        secretaryUser.auth,
        group.id,
        { phone: randomPhone(), fullName: 'Test', role: 'TREASURER' },
        403,
      );
    });

    it('change un rôle et garde l’historique dans le journal d’audit', async () => {
      const { president, group, treasurer } = await setup();
      const res = await http()
        .patch(`/groups/${group.id}/members/${treasurer.membershipId}`)
        .set(president.auth)
        .send({ role: 'AUDITOR' })
        .expect(200);
      expect((res.body as MemberBody).role).toBe('AUDITOR');

      const log = await prisma.auditLog.findFirst({
        where: {
          entityId: treasurer.membershipId,
          action: 'membership.role_changed',
        },
      });
      expect(log?.data).toEqual({ from: 'TREASURER', to: 'AUDITOR' });
    });

    it('le groupe garde toujours au moins un président', async () => {
      const { president, group, treasurer } = await setup();
      const members = await http()
        .get(`/groups/${group.id}/members`)
        .set(president.auth)
        .expect(200);
      const me = (members.body as MemberBody[]).find(
        (m) => m.userId === president.user.id,
      )!;

      // Le seul président ne peut ni se rétrograder ni partir…
      await http()
        .patch(`/groups/${group.id}/members/${me.membershipId}`)
        .set(president.auth)
        .send({ role: 'MEMBER' })
        .expect(400);
      await http()
        .delete(`/groups/${group.id}/members/${me.membershipId}`)
        .set(president.auth)
        .expect(400);

      // …mais le peut après avoir nommé un autre président.
      await http()
        .patch(`/groups/${group.id}/members/${treasurer.membershipId}`)
        .set(president.auth)
        .send({ role: 'PRESIDENT' })
        .expect(200);
      await http()
        .delete(`/groups/${group.id}/members/${me.membershipId}`)
        .set(president.auth)
        .expect(204);
      await http().get(`/groups/${group.id}`).set(president.auth).expect(404);
    });

    it('un membre peut quitter le groupe, mais pas en retirer un autre', async () => {
      const { president, group, treasurerUser, treasurer } = await setup();
      const other = await addMember(president.auth, group.id, {
        phone: randomPhone(),
        fullName: 'Autre membre',
      });
      await http()
        .delete(`/groups/${group.id}/members/${other.membershipId}`)
        .set(treasurerUser.auth)
        .expect(403);
      await http()
        .delete(`/groups/${group.id}/members/${treasurer.membershipId}`)
        .set(treasurerUser.auth)
        .expect(204);
    });
  });
});
