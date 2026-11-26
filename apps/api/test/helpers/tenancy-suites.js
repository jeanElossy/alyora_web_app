import { describe, it } from 'vitest';
import {
  expectCheckinAgentDeniedFinancial,
  expectHiddenFromOtherTenants,
  expectReaderCannotWrite,
} from './tenancy-assertions.js';
import { expectUnscopedQueriesRefused } from './tenant-scope-assertions.js';

/**
 * Tests d'accès types d'une ressource portée par un événement, à appeler dans le fichier de
 * test de chaque ressource des lots suivants (le fichier appelle useAccessDatabase()) :
 * - un utilisateur de l'événement A ne lit pas une ressource de l'événement B (404, pas 403) ;
 * - un Reader ne peut pas écrire (si `writes` est fourni) ;
 * - un CheckinAgent n'accède à aucune donnée financière (si `financial` est fourni).
 *
 * @param {import('./tenancy-assertions.js').TenantResourceSpec} spec
 */
export function describeTenantResource(spec) {
  describe(`${spec.name}: tenant isolation and permissions`, () => {
    it('hides a resource of another event: 404, never 403, exactly like an unknown one', () =>
      expectHiddenFromOtherTenants(spec));

    if (spec.writes) {
      it('refuses every write to a reader (403)', () => expectReaderCannotWrite(spec));
    }

    if (spec.financial) {
      it('refuses every financial route to a check-in agent (403)', () =>
        expectCheckinAgentDeniedFinancial(spec));
    }
  });
}

/**
 * Une requête sans filtre de cloisonnement lève une erreur, pour un modèle cloisonné. Le test
 * de classement des modèles l'applique déjà à chaque modèle de src/ ; un lot peut l'appeler
 * pour un modèle défini ailleurs.
 *
 * @param {import('mongoose').Model<any>} Model
 */
export function describeTenantScopedModel(Model) {
  it(`${Model.modelName}: refuses every query without a tenant filter`, () =>
    expectUnscopedQueriesRefused(Model));
}
