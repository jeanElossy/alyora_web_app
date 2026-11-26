import { randomUUID } from 'node:crypto';
import { ROLE_KEYS, isOwnerRole } from '@alyora/shared';
import mongoose from 'mongoose';
import { beforeAll } from 'vitest';
import { up as createAccessCollections } from '../../migrations/20261126090000-access-collections.js';
import { createAccessTokens } from '../../src/lib/auth/access-token.js';
import { Collaborator } from '../../src/modules/access/models/collaborator.model.js';
import { Organization } from '../../src/modules/access/models/organization.model.js';
import { systemClock } from '../../src/modules/auth/auth-module.js';
import { User } from '../../src/modules/auth/models/user.model.js';
import { TEST_SECRETS } from './app.js';
import { createBrowser, useAuthDatabase } from './auth.js';

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
