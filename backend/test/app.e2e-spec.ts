import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'cotisations-api' });
  });

  it('POST /tontines/simulate : 12 membres à 500 000 GNF par mois', async () => {
    const res = await request(app.getHttpServer())
      .post('/tontines/simulate')
      .send({
        contributionAmount: '500000',
        shareCount: 12,
        periodicity: 'MONTHLY',
        startDate: '2027-01-05',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      potAmount: '6000000',
      roundCount: 12,
      endDate: '2027-12-05',
    });
    const body = res.body as { rounds: unknown[] };
    expect(body.rounds).toHaveLength(12);
  });

  it('POST /tontines/simulate refuse une date impossible', () => {
    return request(app.getHttpServer())
      .post('/tontines/simulate')
      .send({
        contributionAmount: '10000',
        shareCount: 5,
        periodicity: 'DAILY',
        startDate: '2027-02-30',
      })
      .expect(400);
  });

  it('POST /tontines/simulate refuse un montant non entier', () => {
    return request(app.getHttpServer())
      .post('/tontines/simulate')
      .send({
        contributionAmount: '1500.50',
        shareCount: 5,
        periodicity: 'DAILY',
        startDate: '2027-02-01',
      })
      .expect(400);
  });
});
