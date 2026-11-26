import { randomUUID } from 'node:crypto';
import { ROLE_KEYS, isOwnerRole, permissionsOfRole } from '@alyora/shared';
import mongoose from 'mongoose';
import { beforeAll } from 'vitest';
import { up as createAccessCollections } from '../../migrations/20261126090000-access-collections.js';
import { createAuditLog } from '../../src/lib/audit/audit-log.js';
import { createAccessTokens } from '../../src/lib/auth/access-token.js';
import { createServiceContext } from '../../src/lib/context/service-context.js';
import { createKeyedHasher } from '../../src/lib/crypto/keyed-hash.js';
import { createAccessEmails } from '../../src/modules/access/access-emails.js';
import { Collaborator } from '../../src/modules/access/models/collaborator.model.js';
import { Organization } from '../../src/modules/access/models/organization.model.js';
import { createAccessServices } from '../../src/modules/access/services/access-services.js';
import { createPermissionResolver } from '../../src/modules/access/services/permission-resolver.js';
import { systemClock } from '../../src/modules/auth/auth-module.js';
import { User } from '../../src/modules/auth/models/user.model.js';
import { TEST_SECRETS, createTestLogger } from './app.js';
import { createBrowser, createTestClock, useAuthDatabase } from './auth.js';
import { createRecordingMailer } from './mail.js';
import { createMemoryPermissionCache } from './permission-cache.js';

/** @typedef {import('@alyora/shared').RoleKey} RoleKey */
/** @typedef {import('@alyora/shared').Permission} Permission */

/**
 * Un compte de test et son access token.
 *
 * @typedef {object} Actor
 * @property {string} userId
 * @property {string} token Access token valide, adresse vérifiée.
 * @property {string | null} collaboratorId null pour un compte étranger à l'événement.
 */

/**
 * Un événement de test : une organisation, un collaborateur actif par rôle prédéfini, et un
 * compte étranger à l'événement (`outsider`).
 *
 * @typedef {object} SeededEvent
 * @property {string} eventId
 * @property {string} organizationId
 * @property {Record<RoleKey | 'outsider', Actor>} actors
 */

/** Base de test propre au fichier, avec les collections et index de l'auth et des accès. */
export function useAccessDatabase() {
  useAuthDatabase();
  beforeAll(async () => {
    const { db } = mongoose.connection;
    if (!db) {
      throw new Error('useAccessDatabase(): no open MongoDB connection');
    }
    await createAccessCollections(db);
  });
}

const accessTokens = createAccessTokens({
  secret: TEST_SECRETS.ACCESS_TOKEN_SECRET,
  clock: systemClock,
});

/**
 * Un compte vérifié, créé directement en base (sans mot de passe utilisable).
 *
 * @param {string} [label]
 * @returns {Promise<string>} Son identifiant.
 */
export async function createTestUser(label = 'user') {
  const user = await User.create({
    email: `${label}.${randomUUID().slice(0, 8)}@exemple.ci`,
    passwordHash: 'unused',
    firstName: 'Test',
    lastName: label,
    accountType: 'individual',
    emailVerifiedAt: new Date(),
  });
  return String(user._id);
}

/**
 * Access token d'un compte, signé avec le secret de test : requireAuth l'accepte sans session
 * en base.
 *
 * @param {string} userId
 * @param {{ emailVerified?: boolean, authTime?: number }} [options]
 */
export function accessTokenFor(userId, { emailVerified = true, authTime } = {}) {
  return accessTokens.sign({
    userId,
    sessionId: new mongoose.Types.ObjectId().toString(),
    emailVerified,
    authTime: authTime ?? Math.floor(Date.now() / 1000),
  });
}

/**
 * Un collaborateur, créé directement en base avec exactement un rôle.
 *
 * @param {object} values
 * @param {string} values.eventId
 * @param {string} values.organizationId
 * @param {string} values.userId
 * @param {RoleKey} [values.roleKey]
 * @param {string} [values.customRoleId]
 * @param {Permission[]} [values.permissions]
 * @param {string | null} [values.invitedBy]
 * @param {'active' | 'revoked'} [values.status]
 * @returns {Promise<string>} Son identifiant.
 */
export async function addCollaborator({
  eventId,
  organizationId,
  userId,
  roleKey,
  customRoleId,
  permissions,
  invitedBy = null,
  status = 'active',
}) {
  const now = new Date();
  const collaborator = await Collaborator.create({
    eventId,
    organizationId,
    userId,
    ...(roleKey ? { roleKey } : {}),
    ...(customRoleId ? { customRoleId } : {}),
    ...(permissions ? { permissions } : {}),
    invitedBy,
    status,
    acceptedAt: now,
    ...(status === 'revoked' ? { revokedAt: now } : {}),
  });
  return String(collaborator._id);
}

/**
 * Un événement complet : une organisation, un collaborateur actif par rôle prédéfini, et un
 * compte étranger. Deux appels donnent deux locataires entièrement distincts.
 *
 * @param {{ label?: string }} [options]
 * @returns {Promise<SeededEvent>}
 */
export async function seedEvent({ label = 'event' } = {}) {
  const eventId = new mongoose.Types.ObjectId().toString();
  const ownerId = await createTestUser(`owner-${label}`);
  const organization = await Organization.create({
    name: `Organisation ${label}`,
    createdBy: ownerId,
  });
  const organizationId = String(organization._id);

  /** @type {Partial<Record<RoleKey | 'outsider', Actor>>} */
  const actors = {};
  for (const roleKey of ROLE_KEYS) {
    const userId = isOwnerRole(roleKey) ? ownerId : await createTestUser(`${roleKey}-${label}`);
    const collaboratorId = await addCollaborator({
      eventId,
      organizationId,
      userId,
      roleKey,
      invitedBy: isOwnerRole(roleKey) ? null : ownerId,
    });
    actors[roleKey] = { userId, collaboratorId, token: await accessTokenFor(userId) };
  }
  const outsiderId = await createTestUser(`outsider-${label}`);
  actors.outsider = {
    userId: outsiderId,
    collaboratorId: null,
    token: await accessTokenFor(outsiderId),
  };
  return {
    eventId,
    organizationId,
    actors: /** @type {Record<RoleKey | 'outsider', Actor>} */ (actors),
  };
}

/**
 * Client HTTP authentifié comme `actor` : il envoie son access token et, sur les requêtes qui
 * modifient l'état, le jeton CSRF (voir createBrowser).
 *
 * @param {import('express').Express} app
 * @param {Pick<Actor, 'token'>} actor
 */
export function apiAs(app, actor) {
  const browser = createBrowser(app);
  browser.state.accessToken = actor.token;
  return browser;
}

/** Un identifiant qui ne désigne rien. */
export const unknownId = () => new mongoose.Types.ObjectId().toString();

/**
 * Services de l'équipe d'un événement, avec des dépendances de test : horloge réglable (partie
 * de maintenant), mailer qui enregistre, logs capturés, cache des permissions en mémoire.
 */
export function createTestAccessServices() {
  const clock = createTestClock(new Date());
  const mailer = createRecordingMailer();
  const { logger, logs } = createTestLogger();
  const cache = createMemoryPermissionCache();
  const resolver = createPermissionResolver({ cache, logger });
  const services = createAccessServices({
    clock,
    logger,
    mailer,
    emails: createAccessEmails({ webAppUrl: 'http://localhost:5173' }),
    auditLog: createAuditLog({ keyedHasher: createKeyedHasher(TEST_SECRETS.HASH_SECRET), clock }),
    resolver,
  });
  return { services, clock, mailer, logs, resolver, cache };
}

/**
 * Contexte de service d'un acteur de l'événement, comme le construit eventServiceContext :
 * les permissions de son rôle prédéfini (aucune pour un compte étranger).
 *
 * @param {SeededEvent} event
 * @param {RoleKey | 'outsider'} name
 */
export function contextAs(event, name) {
  const actor = event.actors[name];
  return createServiceContext({
    userId: actor.userId,
    eventId: event.eventId,
    organizationId: event.organizationId,
    permissions: name === 'outsider' ? [] : permissionsOfRole(name),
    ip: '203.0.113.7',
    userAgent: 'Test',
  });
}

/**
 * Événement et jeton du lien d'un e-mail d'invitation (dans le fragment).
 *
 * @param {{ text: string }} message
 * @returns {{ eventId: string, token: string }}
 */
export function invitationLinkFrom(message) {
  const match = /#evenement=([0-9a-f]{24})&jeton=([A-Za-z0-9_-]{22})/.exec(message.text);
  if (!match?.[1] || !match[2]) {
    throw new Error('No invitation link in this e-mail');
  }
  return { eventId: match[1], token: match[2] };
}
