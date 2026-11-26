// Ressource de démonstration, présente seulement dans les tests : une note portée par un
// événement, servie par la vraie chaîne (route → Zod → auth → permission → controller →
// service → modèle). Elle exerce les tests d'accès types (test/helpers/tenancy-suites.js),
// avec des variantes volontairement fautives qui prouvent que ces tests détectent une fuite.
import { eventIdParamsSchema, objectIdSchema } from '@alyora/shared';
import express from 'express';
import { MemoryStore } from 'express-rate-limit';
import mongoose from 'mongoose';
import { z } from 'zod';
import { getAuth } from '../../src/lib/auth/require-auth.js';
import { eventServiceContext } from '../../src/lib/context/event-context.js';
import { createServiceContext, eventIdOf } from '../../src/lib/context/service-context.js';
import { AppError, isAppError } from '../../src/lib/errors/app-error.js';
import { getValidated } from '../../src/lib/http/validate.js';
import { defineRoute, mountRoutes } from '../../src/lib/openapi/registry.js';
import { tenantScoped } from '../../src/lib/tenancy/tenant-scope.plugin.js';
import { createAccessModule } from '../../src/modules/access/access-module.js';
import { createAuthModule } from '../../src/modules/auth/auth-module.js';
import { buildPipelineApp, createTestConfig } from '../helpers/app.js';
import { createFastPasswordHasher } from '../helpers/auth.js';
import { createRecordingMailer } from '../helpers/mail.js';
import { createMemoryPermissionCache } from '../helpers/permission-cache.js';

const probeNoteSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    text: { type: String, required: true },
  },
  { collection: 'probe_notes', strict: 'throw' },
);
probeNoteSchema.plugin(tenantScoped, { keys: ['eventId'] });

export const ProbeNote = mongoose.model('ProbeNote', probeNoteSchema);

const noteParamsSchema = eventIdParamsSchema.extend({ noteId: objectIdSchema });
const noteBodySchema = z.strictObject({ text: z.string().min(1).max(200) });

/** @param {{ _id: unknown, text: string }} note */
const serialize = (note) => ({ id: String(note._id), text: note.text });

/** Service de la note : chaque requête porte l'événement du contexte. */
const probeService = {
  /**
   * @param {import('../../src/lib/context/service-context.js').ServiceContext} context
   * @param {string} noteId
   */
  async get(context, noteId) {
    const note = await ProbeNote.findOne({ _id: noteId, eventId: eventIdOf(context) }).lean();
    if (!note) {
      throw new AppError('NOT_FOUND');
    }
    return serialize(note);
  },
  /**
   * @param {import('../../src/lib/context/service-context.js').ServiceContext} context
   */
  async list(context) {
    const notes = await ProbeNote.find({ eventId: eventIdOf(context) })
      .sort({ _id: 1 })
      .limit(100);
    return notes.map(serialize);
  },
  /**
   * @param {import('../../src/lib/context/service-context.js').ServiceContext} context
   * @param {{ text: string }} input
   */
  async create(context, { text }) {
    return serialize(await ProbeNote.create({ eventId: eventIdOf(context), text }));
  },
  /**
   * @param {import('../../src/lib/context/service-context.js').ServiceContext} context
   * @param {string} noteId
   * @param {{ text: string }} input
   */
  async update(context, noteId, { text }) {
    const note = await ProbeNote.findOneAndUpdate(
      { _id: noteId, eventId: eventIdOf(context) },
      { text },
      { returnDocument: 'after' },
    ).lean();
    if (!note) {
      throw new AppError('NOT_FOUND');
    }
    return serialize(note);
  },
};

/** @param {import('express').Request} req */
const noteId = (req) => /** @type {{ noteId: string }} */ (getValidated(req, 'params')).noteId;
/** @param {import('express').Request} req */
const body = (req) => /** @type {{ text: string }} */ (getValidated(req, 'body'));

/**
 * @param {import('../../src/lib/auth/require-auth.js').AuthGuards} auth
 * @param {import('../../src/lib/auth/require-permission.js').PermissionGuards} access
 */
function probeRoutes(auth, access) {
  const signedIn = auth.requireAuth();
  const readGuard = access.requirePermission('guests:read');
  const params = { params: eventIdParamsSchema };
  const noteParams = { params: noteParamsSchema };
  /**
   * @param {(req: import('express').Request) => Promise<unknown>} work
   * @returns {import('express').RequestHandler}
   */
  const json =
    (work, status = 200) =>
    async (req, res) => {
      res.status(status).json(await work(req));
    };
  const responses = { 200: { description: 'ok' } };

  return [
    // La ressource correcte.
    defineRoute({
      method: 'get',
      path: '/events/:eventId/probe-notes',
      summary: 'List',
      request: params,
      after: [signedIn, access.requirePermission('guests:read')],
      responses,
      handler: json((req) => probeService.list(eventServiceContext(req))),
    }),
    defineRoute({
      method: 'get',
      path: '/events/:eventId/probe-notes/:noteId',
      summary: 'Read',
      request: noteParams,
      after: [signedIn, access.requirePermission('guests:read')],
      responses,
      handler: json((req) => probeService.get(eventServiceContext(req), noteId(req))),
    }),
    defineRoute({
      method: 'post',
      path: '/events/:eventId/probe-notes',
      summary: 'Create',
      request: { ...params, body: noteBodySchema },
      after: [signedIn, access.requirePermission('guests:write')],
      responses,
      handler: json((req) => probeService.create(eventServiceContext(req), body(req)), 201),
    }),
    defineRoute({
      method: 'patch',
      path: '/events/:eventId/probe-notes/:noteId',
      summary: 'Update',
      request: { ...noteParams, body: noteBodySchema },
      after: [signedIn, access.requirePermission('guests:write')],
      responses,
      handler: json((req) => probeService.update(eventServiceContext(req), noteId(req), body(req))),
    }),
    defineRoute({
      method: 'get',
      path: '/events/:eventId/probe-ledger',
      summary: 'Financial read',
      request: params,
      after: [signedIn, access.requirePermission('contributions:read')],
      responses,
      handler: json(async () => ({ total: { amount: 0, currency: 'XOF' } })),
    }),
    defineRoute({
      method: 'post',
      path: '/events/:eventId/probe-payouts',
      summary: 'Financial write',
      request: params,
      after: [signedIn, access.requirePermission('payouts:manage')],
      responses,
      handler: json(async () => ({ status: 'accepted' }), 202),
    }),

    // Variantes fautives : chacune doit faire échouer un test d'accès type.
    defineRoute({
      method: 'get',
      path: '/events/:eventId/leaky-notes/:noteId',
      summary: 'No event access check: any signed-in account reads any event',
      request: noteParams,
      after: [signedIn],
      responses,
      handler: json((req) => {
        const { eventId } = /** @type {{ eventId: string }} */ (getValidated(req, 'params'));
        const context = createServiceContext({ userId: getAuth(req).userId, eventId });
        return probeService.get(context, noteId(req));
      }),
    }),
    defineRoute({
      method: 'get',
      path: '/events/:eventId/forbidding-notes/:noteId',
      summary: 'Answers 403 to another tenant, which confirms that the event exists',
      request: noteParams,
      after: [
        signedIn,
        async (req, res, next) => {
          try {
            // Les gardes sont asynchrones et lèvent leur refus : il suffit de les attendre.
            await readGuard(req, res, () => {});
          } catch (error) {
            // La faute : 403 quand l'événement existe, ce qui le confirme à un étranger.
            const { eventId } = /** @type {{ eventId: string }} */ (getValidated(req, 'params'));
            const exists = await ProbeNote.exists({ eventId });
            throw isAppError(error) && error.code === 'NOT_FOUND' && exists
              ? new AppError('FORBIDDEN')
              : error;
          }
          next();
        },
      ],
      responses,
      handler: json((req) => probeService.get(eventServiceContext(req), noteId(req))),
    }),
    defineRoute({
      method: 'post',
      path: '/events/:eventId/leaky-notes',
      summary: 'A write guarded by a read permission',
      request: { ...params, body: noteBodySchema },
      after: [signedIn, access.requirePermission('guests:read')],
      responses,
      handler: json((req) => probeService.create(eventServiceContext(req), body(req)), 201),
    }),
    defineRoute({
      method: 'get',
      path: '/events/:eventId/leaky-ledger',
      summary: 'Financial data guarded by event:read',
      request: params,
      after: [signedIn, access.requirePermission('event:read')],
      responses,
      handler: json(async () => ({ total: { amount: 0, currency: 'XOF' } })),
    }),
  ];
}

/**
 * Application de test : la chaîne de middlewares de production, les routes de l'auth (jeton
 * CSRF) et des accès, et les routes de la note.
 *
 * @param {{ permissionCache?: import('../../src/modules/access/services/permission-cache.js').PermissionCache }} [options]
 */
export function buildProbeApp({ permissionCache = createMemoryPermissionCache() } = {}) {
  /** @type {import('../../src/modules/access/access-module.js').AccessModule | undefined} */
  let accessModule;
  const built = buildPipelineApp((app, logger) => {
    const auth = createAuthModule({
      config: createTestConfig(),
      logger,
      mailer: createRecordingMailer(),
      createRateLimitStore: () => new MemoryStore(),
      passwordHasher: createFastPasswordHasher(),
    });
    accessModule = createAccessModule({ logger, permissionCache, authGuards: auth.guards });
    const router = express.Router();
    mountRoutes(router, [
      ...auth.routes,
      ...accessModule.routes,
      ...probeRoutes(auth.guards, accessModule.guards),
    ]);
    app.use('/api/v1', router);
  });
  return { ...built, access: /** @type {NonNullable<typeof accessModule>} */ (accessModule) };
}

/** @param {{ eventId: string }} event */
export async function createProbeNote(event) {
  return String((await ProbeNote.create({ eventId: event.eventId, text: 'Note' }))._id);
}
