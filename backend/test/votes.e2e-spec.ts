import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, FakeSmsSender, signUp } from './helpers';

interface VoteBody {
  id: string;
  status: string;
  options: string[];
  counts: number[];
  ballots: number;
  eligible: number;
  participation: number;
  quorumReached: boolean;
  winner: string | null;
  tie: boolean;
  myBallot: number | null;
  voters: string[];
}

const inOneDay = () => new Date(Date.now() + 24 * 3600_000).toISOString();

describe('Votes (e2e)', () => {
  let app: INestApplication<App>;
  let sms: FakeSmsSender;

  beforeAll(async () => {
    ({ app, sms } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Association de 4 membres actifs : présidente, secrétaire, trésorier, membre. */
  async function setup() {
    const president = await signUp(app, sms, 'Hadja Kadiatou');
    const secretary = await signUp(app, sms, 'Mamadou Sylla');
    const treasurer = await signUp(app, sms, 'Ibrahima Sow');
    const member = await signUp(app, sms, 'Binta Camara');
    const group = (
      await http()
        .post('/groups')
        .set(president.auth)
        .send({ type: 'COMMUNITY', name: 'Association de Dalaba' })
        .expect(201)
    ).body as { id: string };
    for (const [user, role] of [
      [secretary, 'SECRETARY'],
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
    const V = (path = '') => `/groups/${group.id}/votes${path}`;
    const vote = (
      voteId: string,
      auth: { Authorization: string },
      optionIndex: number,
      status = 201,
    ) =>
      http()
        .post(V(`/${voteId}/ballots`))
        .set(auth)
        .send({ optionIndex })
        .expect(status);
    return { president, secretary, treasurer, member, group, V, vote };
  }

  it('ouvre un vote, prévient les membres ; bulletin secret et vote unique', async () => {
    const s = await setup();
    sms.sent.length = 0;
    const opened = (
      await http()
        .post(s.V())
        .set(s.secretary.auth)
        .send({
          question: 'Quel projet financer en priorité ?',
          options: ['Puits', 'École', 'Route'],
          closesAt: inOneDay(),
        })
        .expect(201)
    ).body as VoteBody;
    expect(opened).toMatchObject({ status: 'OPEN', eligible: 4, ballots: 0 });
    expect(sms.sent).toHaveLength(3);
    expect(sms.sent[0].message).toContain('vote ouvert');

    const mine = (await s.vote(opened.id, s.member.auth, 1)).body as VoteBody;
    expect(mine).toMatchObject({
      myBallot: 1,
      ballots: 1,
      voters: ['Binta Camara'],
    });
    await s.vote(opened.id, s.member.auth, 0, 409); // une seule fois
    await s.vote(opened.id, s.treasurer.auth, 7, 400); // option inexistante

    // Un autre membre voit qui a voté, jamais pour quoi.
    const seen = (
      await http()
        .get(s.V(`/${opened.id}`))
        .set(s.treasurer.auth)
        .expect(200)
    ).body as VoteBody & Record<string, unknown>;
    expect(seen.voters).toEqual(['Binta Camara']);
    expect(seen.myBallot).toBeNull();
    expect(JSON.stringify(seen)).not.toContain('optionIndex');
  });

  it('résultat : gagnant si le quorum est atteint, sinon aucun', async () => {
    const s = await setup();
    const open = async () =>
      (
        await http()
          .post(s.V())
          .set(s.president.auth)
          .send({
            question: 'Augmenter la cotisation annuelle ?',
            options: ['Oui', 'Non'],
            quorumPercent: 75,
            closesAt: inOneDay(),
          })
          .expect(201)
      ).body as VoteBody;

    // 3 bulletins sur 4 = 75 % : quorum atteint.
    const v1 = await open();
    await s.vote(v1.id, s.member.auth, 0);
    await s.vote(v1.id, s.treasurer.auth, 0);
    await s.vote(v1.id, s.secretary.auth, 1);
    const closed = (
      await http()
        .post(s.V(`/${v1.id}/close`))
        .set(s.president.auth)
        .expect(200)
    ).body as VoteBody;
    expect(closed).toMatchObject({
      status: 'CLOSED',
      counts: [2, 1],
      participation: 75,
      quorumReached: true,
      winner: 'Oui',
    });
    await s.vote(v1.id, s.president.auth, 0, 409); // vote clos

    // 2 bulletins sur 4 = 50 % < 75 % : pas de gagnant.
    const v2 = await open();
    await s.vote(v2.id, s.member.auth, 0);
    await s.vote(v2.id, s.treasurer.auth, 0);
    const failed = (
      await http()
        .post(s.V(`/${v2.id}/close`))
        .set(s.president.auth)
        .expect(200)
    ).body as VoteBody;
    expect(failed).toMatchObject({ quorumReached: false, winner: null });
  });

  it('se clôt automatiquement à la date prévue', async () => {
    const s = await setup();
    const v = (
      await http()
        .post(s.V())
        .set(s.president.auth)
        .send({
          question: 'Réunion le samedi ?',
          options: ['Oui', 'Non'],
          closesAt: new Date(Date.now() + 1500).toISOString(),
        })
        .expect(201)
    ).body as VoteBody;
    await new Promise((r) => setTimeout(r, 2000));
    await s.vote(v.id, s.member.auth, 0, 409);
    const after = (
      await http()
        .get(s.V(`/${v.id}`))
        .set(s.member.auth)
        .expect(200)
    ).body as VoteBody;
    expect(after.status).toBe('CLOSED');
  });

  it('un simple membre ou un trésorier n’ouvre pas de vote ; la date doit être future', async () => {
    const s = await setup();
    const body = {
      question: 'Test ?',
      options: ['A', 'B'],
      closesAt: inOneDay(),
    };
    await http().post(s.V()).set(s.member.auth).send(body).expect(403);
    await http().post(s.V()).set(s.treasurer.auth).send(body).expect(403);
    await http()
      .post(s.V())
      .set(s.president.auth)
      .send({ ...body, closesAt: '2020-01-01T00:00:00Z' })
      .expect(400);
  });

  it('un projet budgétisé gagné par « Pour » passe à l’étape validé', async () => {
    const s = await setup();
    const project = (
      await http()
        .post(`/groups/${s.group.id}/projects`)
        .set(s.president.auth)
        .send({
          title: 'École de Bodié',
          description: 'Deux salles de classe.',
        })
        .expect(201)
    ).body as { id: string };
    const P = `/groups/${s.group.id}/projects/${project.id}`;

    // Pas de vote avant le budget.
    await http()
      .post(`${P}/vote`)
      .set(s.president.auth)
      .send({ closesAt: inOneDay() })
      .expect(409);
    await http()
      .put(`${P}/budget`)
      .set(s.president.auth)
      .send({ lines: [{ label: 'Construction', amount: '20000000' }] })
      .expect(200);

    const v = (
      await http()
        .post(`${P}/vote`)
        .set(s.president.auth)
        .send({ closesAt: inOneDay() })
        .expect(201)
    ).body as VoteBody;
    expect(v.options).toEqual(['Pour', 'Contre']);
    await http()
      .post(`${P}/vote`)
      .set(s.president.auth)
      .send({ closesAt: inOneDay() })
      .expect(409); // un seul vote ouvert par projet

    await s.vote(v.id, s.member.auth, 0);
    await s.vote(v.id, s.treasurer.auth, 0);
    await s.vote(v.id, s.secretary.auth, 1);
    await http()
      .post(s.V(`/${v.id}/close`))
      .set(s.president.auth)
      .expect(200);

    const after = (await http().get(P).set(s.member.auth).expect(200)).body as {
      status: string;
    };
    expect(after.status).toBe('VOTED');
  });

  it('un projet rejeté par le vote reste budgétisé', async () => {
    const s = await setup();
    const project = (
      await http()
        .post(`/groups/${s.group.id}/projects`)
        .set(s.president.auth)
        .send({ title: 'Stade', description: 'Terrain de football.' })
        .expect(201)
    ).body as { id: string };
    const P = `/groups/${s.group.id}/projects/${project.id}`;
    await http()
      .put(`${P}/budget`)
      .set(s.president.auth)
      .send({ lines: [{ label: 'Terrain', amount: '5000000' }] })
      .expect(200);
    const v = (
      await http()
        .post(`${P}/vote`)
        .set(s.president.auth)
        .send({ closesAt: inOneDay() })
        .expect(201)
    ).body as VoteBody;
    await s.vote(v.id, s.member.auth, 1);
    await s.vote(v.id, s.treasurer.auth, 1);
    await s.vote(v.id, s.secretary.auth, 0);
    await http()
      .post(s.V(`/${v.id}/close`))
      .set(s.president.auth)
      .expect(200);
    const after = (await http().get(P).set(s.member.auth).expect(200)).body as {
      status: string;
    };
    expect(after.status).toBe('BUDGETED');
  });
});
