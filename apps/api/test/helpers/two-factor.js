import { base32Decode, hotp, totpStep } from '../../src/lib/auth/totp.js';
import {
  anonymousContext,
  createTestAuthServices,
  registration,
  sessionTokens,
  userContext,
} from './auth.js';
import { tokenFrom } from './mail.js';

export const EMAIL = 'awa.kone@exemple.ci';
export const PASSWORD = 'Le soleil se lève sur la lagune';

/**
 * Code TOTP d'un secret à une date (ce qu'afficherait l'application d'authentification).
 *
 * @param {string} secret
 * @param {Date} at
 * @param {number} [offset] Décalage en pas de 30 secondes.
 */
export const totpCode = (secret, at, offset = 0) =>
  hotp(base32Decode(secret), totpStep(at) + offset);

/** Un compte vérifié et connecté, au niveau des services. */
export async function signedInAccount() {
  const deps = createTestAuthServices();
  await deps.services.registration.register(anonymousContext(), registration());
  await deps.services.emailVerification.verify(anonymousContext(), {
    token: tokenFrom(deps.mailer.to(EMAIL).at(-1), 'verifyEmail'),
  });
  const tokens = sessionTokens(
    await deps.services.login.login(anonymousContext(), { email: EMAIL, password: PASSWORD }),
  );
  const claims = await deps.accessTokens.verify(tokens.accessToken);
  deps.mailer.clear();
  return { ...deps, tokens, claims, context: userContext(claims.userId, claims.sessionId) };
}

/** Un compte connecté avec la 2FA active ; renvoie aussi le secret et les codes de secours. */
export async function accountWithTwoFactor() {
  const account = await signedInAccount();
  const { secret } = await account.services.twoFactor.setup(account.context);
  const backupCodes = await account.services.twoFactor.enable(account.context, {
    otp: totpCode(secret, account.clock.now()),
  });
  // Le pas de l'activation est consommé : on passe au suivant pour les codes à venir.
  account.clock.advance(30_000);
  account.mailer.clear();
  return { ...account, secret, backupCodes };
}
