import { expect } from 'vitest';
import { apiAs, seedEvent } from './access.js';

/**
 * Une route qui accorde un rôle (invitation, changement de rôle, rôle personnalisé...).
 *
 * @typedef {object} GrantSpec
 * @property {string} name
 * @property {() => import('express').Express} app
 * @property {(client: ReturnType<typeof apiAs>, grant: { event: import('./access.js').SeededEvent, role: import('@alyora/shared').RoleAssignment }) => Promise<import('supertest').Response>} grant
 *   Envoie la requête qui accorde `role` dans l'événement.
 * @property {(event: import('./access.js').SeededEvent) => Promise<Pick<import('./access.js').Actor, 'token'>>} [granter]
 *   Le compte qui accorde ; l'Editor de l'événement par défaut.
 */

/**
 * Un Editor (ou le compte `granter`) ne peut pas accorder une permission qu'il n'a pas : ni une
 * permission absente de son rôle, ni un rôle au-dessus du sien, ni le rôle de propriétaire.
 * Chaque tentative reçoit 403 PERMISSION_ESCALATION ; accorder un sous-ensemble de ses
 * permissions réussit (contrôle).
 *
 * @param {GrantSpec} spec
 */
export async function expectPermissionEscalationRefused(spec) {
  const event = await seedEvent({ label: 'escalation' });
  const granter = apiAs(spec.app(), spec.granter ? await spec.granter(event) : event.actors.editor);

  /** @type {Array<[string, import('@alyora/shared').RoleAssignment]>} */
  const attempts = [
    [
      'a permission they lack',
      { type: 'explicit', permissions: ['guests:read', 'contributions:read'] },
    ],
    ['a role above their own', { type: 'predefined', key: 'admin' }],
    ['the owner role', { type: 'predefined', key: 'owner' }],
  ];
  for (const [label, role] of attempts) {
    const response = await spec.grant(granter, { event, role });
    expect(
      { status: response.status, code: response.body?.code },
      `${spec.name}: granting ${label}`,
    ).toEqual({ status: 403, code: 'PERMISSION_ESCALATION' });
  }

  const control = await spec.grant(granter, { event, role: { type: 'predefined', key: 'reader' } });
  expect(control.status, `${spec.name}: control, granting a subset of their own`).toBeLessThan(300);
}
