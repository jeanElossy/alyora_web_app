import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../src/lib/errors/app-error.js';
import { validate } from '../../src/lib/http/validate.js';
import { buildPipelineApp } from '../helpers/app.js';

const PASSWORD = 'Tr0ub4dor&3-unique-marker';

/**
 * Un service, tel que les modules métier les écriront : il ne sait rien de la requête et
 * journalise par le logger partagé.
 *
 * @param {import('pino').Logger} logger
 * @param {string} label
 */
async function inviteGuest(logger, label) {
  logger.info({ step: 'start', label }, 'Inviting guest');
  await delay(Math.floor(Math.random() * 10));
  logger.info({ step: 'end', label }, 'Guest invited');
}

function buildApp() {
  return buildPipelineApp((app, logger) => {
    app.post('/invitations', async (req, res) => {
      await inviteGuest(logger, String(req.query.label));
      res.status(201).json({ ok: true });
    });
    app.post(
      '/sign-in',
      validate(z.strictObject({ email: z.email(), password: z.string().min(40) }), 'body'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    app.post('/crash', async (req) => {
      await delay(1);
      // Pire cas : un message d'erreur construit à partir de l'entrée.
      throw new Error(`Cannot process ${JSON.stringify(req.body)}`);
    });
    app.post('/forbidden', () => {
      throw new AppError('FORBIDDEN');
    });
  });
}

describe('correlation of the logs of a request', () => {
  it('gives the same correlation id to every line of a request, service lines included', async () => {
    const { app, logs } = buildApp();

    const response = await request(app).post('/invitations?label=one').send({});

    const correlationId = response.headers['x-request-id'];
    const lines = logs.entries();
    expect(lines.map((line) => line.msg)).toEqual([
      'Inviting guest',
      'Guest invited',
      'request completed',
    ]);
    for (const line of lines) {
      expect(line.correlationId).toBe(correlationId);
    }
  });

  it('keeps the ids apart when 50 requests run concurrently (race)', async () => {
    const { app, logs } = buildApp();

    const responses = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        request(app).post(`/invitations?label=r${index}`).send({}),
      ),
    );

    const idByLabel = new Map(
      responses.map((response, index) => [`r${index}`, response.headers['x-request-id']]),
    );
    const serviceLines = logs.entries().filter((line) => line.label);
    expect(serviceLines).toHaveLength(100);
    for (const line of serviceLines) {
      expect(line.correlationId).toBe(idByLabel.get(line.label));
    }
    expect(new Set(idByLabel.values()).size).toBe(50);
  });

  it('logs the completion line of a failed request with the same id', async () => {
    const { app, logs } = buildApp();

    const response = await request(app).post('/forbidden').send({});

    const lines = logs.entries();
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line.correlationId).toBe(response.headers['x-request-id']);
    }
    expect(lines.at(-1)).toMatchObject({ level: 'warn', res: { statusCode: 403 } });
  });
});

describe('a password sent in a request body', () => {
  const body = {
    email: 'awa@example.ci',
    password: PASSWORD,
    profile: { previous: { password: PASSWORD } },
  };

  it('appears nowhere in the logs nor in the response, whatever happens to the request', async () => {
    const { app, logs } = buildApp();

    const responses = [
      // Chemin de succès.
      await request(app).post('/invitations?label=x').send(body),
      // Échec de validation (le mot de passe est trop court pour ce schéma).
      await request(app).post('/sign-in').send(body),
      // Erreur du handler dont le message contient tout le corps.
      await request(app).post('/crash').send(body),
      // JSON mal formé : le message d'erreur du parseur cite le corps brut.
      await request(app)
        .post('/sign-in')
        .set('Content-Type', 'application/json')
        .send(`{"email":"awa@example.ci","password":${PASSWORD}}`),
      // Query string et en-têtes d'identification.
      await request(app)
        .post(`/forbidden?password=${encodeURIComponent(PASSWORD)}`)
        .set('Authorization', `Bearer ${PASSWORD}`)
        .set('Cookie', `refresh_token=${PASSWORD}`)
        .send(body),
    ];

    expect(responses.map((response) => response.status)).toEqual([201, 400, 500, 400, 403]);
    expect(logs.lines.length).toBeGreaterThan(5);
    expect(logs.text()).not.toContain(PASSWORD);
    expect(logs.text()).not.toContain(encodeURIComponent(PASSWORD));
    for (const response of responses) {
      expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
    }
  });

  it('is not even logged when the handler logs the whole body by mistake', async () => {
    const { app, logs } = buildPipelineApp((pipelineApp, logger) => {
      pipelineApp.post('/careless', (req, res) => {
        logger.info({ body: req.body, headers: req.headers }, 'Careless log');
        res.json({ ok: true });
      });
    });

    await request(app).post('/careless').set('Authorization', `Bearer ${PASSWORD}`).send(body);

    expect(logs.text()).toContain('Careless log');
    expect(logs.text()).not.toContain(PASSWORD);
    expect(logs.text()).not.toContain('awa@example.ci');
  });
});

describe('payment details sent in a request body', () => {
  const MSISDN = '2250707123456';
  const WALLET = 'WAVE-0505987654';
  const OTP = '918273';

  it('are not logged when the handler logs the whole body, nor when an error message quotes them', async () => {
    const { app, logs } = buildPipelineApp((pipelineApp, logger) => {
      pipelineApp.post('/contributions', (req) => {
        logger.info({ body: req.body }, 'Contribution received');
        throw new Error(`Provider refused payer ${MSISDN} with code ${OTP}`);
      });
    });

    const response = await request(app)
      .post('/contributions')
      .send({
        amount: { amount: 25000, currency: 'XOF' },
        payer: { partyIdType: 'MSISDN', partyId: MSISDN },
        payment: { msisdn: MSISDN, walletNumber: WALLET, otp: OTP },
      });

    expect(response.status).toBe(500);
    expect(logs.text()).toContain('Contribution received');
    expect(logs.text()).toContain('25000');
    for (const value of [MSISDN, WALLET, OTP]) {
      expect(logs.text()).not.toContain(value);
      expect(JSON.stringify(response.body)).not.toContain(value);
    }
  });
});
