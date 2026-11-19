import { createEmailVerificationService } from './email-verification.service.js';
import { createLoginService } from './login.service.js';
import { createPasswordResetService } from './password-reset.service.js';
import { createProfileService } from './profile.service.js';
import { createRefreshService } from './refresh.service.js';
import { createRegistrationService } from './registration.service.js';
import { createSessionService } from './session.service.js';

/**
 * Tous les services de l'authentification, avec leurs dépendances. Aucun ne lit req ni res :
 * chacun reçoit un contexte explicite (ServiceContext) et se teste sans Express.
 *
 * @param {import('./auth-service-deps.js').AuthServiceDeps} deps
 */
export function createAuthServices(deps) {
  const sessions = { ...createSessionService(deps), ...createRefreshService(deps) };
  return {
    sessions,
    login: createLoginService(deps, sessions),
    registration: createRegistrationService(deps),
    emailVerification: createEmailVerificationService(deps),
    passwordReset: createPasswordResetService(deps),
    profile: createProfileService(),
  };
}

/** @typedef {ReturnType<typeof createAuthServices>} AuthServices */
