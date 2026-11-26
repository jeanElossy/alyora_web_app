/**
 * Collections de plateforme : elles n'appartiennent à aucun événement ni à aucune organisation,
 * et ne portent donc pas le plugin de cloisonnement (exception de CLAUDE.md, ADR 0004). Chacune
 * est filtrée par son identifiant ou par userId, jamais lue en entier.
 *
 * Toute autre collection doit être cloisonnée : le test de classement des modèles échoue sinon.
 * Ajouter une entrée ici est une décision d'architecture, tracée dans un ADR.
 */
export const PLATFORM_COLLECTIONS = Object.freeze({
  users: 'Comptes, filtrés par _id ou par e-mail (ADR 0004).',
  sessions: 'Appareils connectés, filtrés par userId (ADR 0004).',
  refresh_tokens: 'Refresh tokens, filtrés par empreinte, famille ou session (ADR 0004).',
  verification_tokens: 'Jetons envoyés par e-mail, filtrés par empreinte ou userId (ADR 0004).',
  two_factor_challenges: 'Étapes 2FA de connexion, filtrées par empreinte (ADR 0004).',
  idempotency_keys: "Clés d'idempotence, filtrées par portée et clé (ADR 0004).",
});
