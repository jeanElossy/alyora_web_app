import { PERMISSIONS, ROLE_KEYS } from '@alyora/shared';
import mongoose from 'mongoose';

/**
 * Champs du rôle accordé, communs aux collaborateurs et aux invitations. Exactement un des
 * trois est renseigné (voir requireSingleRoleAssignment) :
 * - `roleKey` : un rôle prédéfini, dont les permissions sont définies dans @alyora/shared ;
 * - `customRoleId` : un rôle personnalisé de l'organisation de l'événement ;
 * - `permissions` : une liste explicite, vérifiée contre le catalogue.
 *
 * Une fonction plutôt qu'un objet : Mongoose modifie les définitions qu'il reçoit.
 */
export function roleAssignmentFields() {
  return {
    roleKey: { type: String, enum: ROLE_KEYS, default: null },
    customRoleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /** Absent (et non vide) quand le rôle vient d'une clé ou d'un rôle personnalisé. */
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: undefined },
  };
}

/** @param {unknown} value */
const isSet = (value) => value !== null && value !== undefined;

/**
 * Refuse à la validation un document qui n'a pas exactement un rôle.
 *
 * @param {import('mongoose').Schema} schema
 */
export function requireSingleRoleAssignment(schema) {
  schema.pre(
    'validate',
    /** @this {import('mongoose').Document} */
    function checkSingleRoleAssignment() {
      const assigned = [
        isSet(this.get('roleKey')),
        isSet(this.get('customRoleId')),
        Array.isArray(this.get('permissions')),
      ].filter(Boolean).length;
      if (assigned !== 1) {
        this.invalidate(
          'roleKey',
          'Exactly one of roleKey, customRoleId and permissions must be set',
        );
      }
    },
  );
}
