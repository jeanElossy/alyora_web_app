import { createAccountLock } from './account-lock.js';
import { createEmailVerificationService } from './email-verification.service.js';
import { createLoginService } from './login.service.js';
import { createPasswordResetService } from './password-reset.service.js';
import { createProfileService } from './profile.service.js';
import { createReauthenticationService } from './reauthentication.service.js';
import { createRefreshService } from './refresh.service.js';
import { createRegistrationService } from './registration.service.js';
import { createSecondFactor } from './second-factor.js';
import { createSessionService } from './session.service.js';
import { createTwoFactorLoginService } from './two-factor-login.service.js';
import { createTwoFactorService } from './two-factor.service.js';

/**
 * Tous les services de l'authentification, avec leurs dépendances. Aucun ne lit req ni res :
 * chacun reçoit un contexte explicite (ServiceContext) et se teste sans Express.
 *
 * @param {import('./auth-service-deps.js').AuthServiceDeps} deps
 */
export function createAuthServices(deps) {
  const sessions = { ...createSessionService(deps), ...createRefreshService(deps) };
  const lock = createAccountLock(deps);
  const secondFactor = createSecondFactor(deps);
  const twoFactorLogin = createTwoFactorLoginService(deps, { sessions, lock, secondFactor });
  return {
    sessions,
    login: createLoginService(deps, { sessions, lock, twoFactorLogin }),
    twoFactorLogin,
    twoFactor: createTwoFactorService(deps, { lock, secondFactor }),
    reauthentication: createReauthenticationService(deps, { lock, secondFactor }),
    registration: createRegistrationService(deps),
    emailVerification: createEmailVerificationService(deps),
    passwordReset: createPasswordResetService(deps),
    profile: createProfileService(),
  };
}

/** @typedef {ReturnType<typeof createAuthServices>} AuthServices */
