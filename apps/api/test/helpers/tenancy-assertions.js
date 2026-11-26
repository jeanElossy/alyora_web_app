import { expect } from 'vitest';
import { apiAs, seedEvent, unknownId } from './access.js';

/** @typedef {import('./access.js').SeededEvent} SeededEvent */
/** @typedef {import('@alyora/shared').RoleKey} RoleKey */

/**
 * Une route d'une ressource d'événement, relative à /api/v1.
 *
 * @typedef {object} EventRoute
 * @property {'get' | 'post' | 'patch' | 'delete'} method
 * @property {(ids: { eventId: string, resourceId: string }) => string} path
 * @property {object} [body]
 */

/**
 * Description d'une ressource portée par un événement, pour les tests d'accès types. Chaque
 * ressource des lots suivants en déclare une et la passe à describeTenantResource.
 *
 * @typedef {object} TenantResourceSpec
 * @property {string} name
 * @property {() => import('express').Express} app L'application (lue au moment du test).
 * @property {(event: SeededEvent) => Promise<string>} create Crée une ressource dans
 *   l'événement, renvoie son identifiant.
 * @property {EventRoute} read Lecture d'une ressource, réussie pour son propriétaire.
 * @property {{ route: EventRoute, ids: (body: any) => string[] }} [list] Liste de l'événement,
 *   et comment y lire les identifiants des ressources.
 * @property {EventRoute[]} [writes] Écritures : toutes refusées à un Reader.
 * @property {EventRoute[]} [financial] Routes financières : toutes refusées à un CheckinAgent.
 */

/**
 * @param {ReturnType<typeof apiAs>} client
 * @param {EventRoute} route
 * @param {{ eventId: string, resourceId: string }} ids
 */
function call(client, route, ids) {
  return client.send(route.method, route.path(ids), { body: route.body });
}

/**
 * Ce qu'un client observe d'une réponse : statut, corps et noms des en-têtes (leurs valeurs
 * varient d'une requête à l'autre : date, identifiant de corrélation, compteurs).
 *
 * @param {import('supertest').Response} response
 */
function observable(response) {
  return {
    status: response.status,
    body: response.body,
    headers: Object.keys(response.headers).sort(),
  };
}

/**
 * Un utilisateur de l'événement A ne lit pas une ressource de l'événement B : 404, jamais 403
 * (qui confirmerait l'existence de la ressource), et une réponse identique à celle d'une
 * ressource qui n'existe pas. Vérifié par l'événement B, par l'événement A, et pour un compte
 * étranger à tout événement ; la liste de A ne contient pas les ressources de B.
 *
 * @param {TenantResourceSpec} spec
 */
export async function expectHiddenFromOtherTenants(spec) {
  const app = spec.app();
  const a = await seedEvent({ label: 'a' });
  const b = await seedEvent({ label: 'b' });
  const resourceOfA = await spec.create(a);
  const resourceOfB = await spec.create(b);
  const memberOfA = apiAs(app, a.actors.owner);

  const own = await call(memberOfA, spec.read, { eventId: a.eventId, resourceId: resourceOfA });
  expect(own.status, `${spec.name}: control, the owner reads their own resource`).toBeLessThan(300);

  const unknown = observable(
    await call(memberOfA, spec.read, { eventId: unknownId(), resourceId: unknownId() }),
  );
  expect(unknown.status, `${spec.name}: reference, an unknown resource`).toBe(404);

  const attempts = /** @type {const} */ ([
    ['through event B', memberOfA, { eventId: b.eventId, resourceId: resourceOfB }],
    ['through their own event A', memberOfA, { eventId: a.eventId, resourceId: resourceOfB }],
    [
      'as an account outside any event',
      apiAs(app, a.actors.outsider),
      { eventId: b.eventId, resourceId: resourceOfB },
    ],
  ]);
  for (const [label, client, ids] of attempts) {
    const response = observable(await call(client, spec.read, ids));
    expect(response, `${spec.name}: a resource of B read ${label}`).toEqual(unknown);
  }

  if (spec.list) {
    const listed = await call(memberOfA, spec.list.route, {
      eventId: a.eventId,
      resourceId: resourceOfA,
    });
    expect(listed.status, `${spec.name}: control, the owner lists their event`).toBe(200);
    const ids = spec.list.ids(listed.body);
    expect(ids, `${spec.name}: the list of A`).toContain(resourceOfA);
    expect(ids, `${spec.name}: the list of A`).not.toContain(resourceOfB);
  }
}

/**
 * Chaque route est refusée au rôle donné (403 FORBIDDEN), et ne l'est pas au propriétaire :
 * le refus tient au rôle, pas à la route.
 *
 * @param {TenantResourceSpec} spec
 * @param {RoleKey} roleKey
 * @param {EventRoute[] | undefined} routes
 */
export async function expectForbiddenToRole(spec, roleKey, routes) {
  expect(routes?.length, `${spec.name}: routes to check for ${roleKey}`).toBeGreaterThan(0);
  const app = spec.app();
  const event = await seedEvent({ label: roleKey });
  const resourceId = await spec.create(event);
  const ids = { eventId: event.eventId, resourceId };
  const denied = apiAs(app, event.actors[roleKey]);
  const owner = apiAs(app, event.actors.owner);

  for (const route of routes ?? []) {
    const label = `${spec.name}: ${route.method.toUpperCase()} ${route.path(ids)}`;
    const response = await call(denied, route, ids);
    expect(
      { status: response.status, code: response.body?.code },
      `${label} as ${roleKey}`,
    ).toEqual({ status: 403, code: 'FORBIDDEN' });
    const control = await call(owner, route, ids);
    expect(control.status, `${label} as the owner (control)`).not.toBe(403);
  }
}

/**
 * Un Reader ne peut rien écrire.
 *
 * @param {TenantResourceSpec} spec
 */
export function expectReaderCannotWrite(spec) {
  return expectForbiddenToRole(spec, 'reader', spec.writes);
}

/**
 * Un CheckinAgent n'accède à aucune donnée financière.
 *
 * @param {TenantResourceSpec} spec
 */
export function expectCheckinAgentDeniedFinancial(spec) {
  return expectForbiddenToRole(spec, 'checkin_agent', spec.financial);
}
