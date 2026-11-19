import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Paramètres argon2id : la deuxième configuration recommandée par l'OWASP (Password Storage
 * Cheat Sheet), équivalente en résistance à la première (46 Mio, t = 1) pour moins de mémoire.
 * - memoryCost : 19 Mio par hachage (en Kio). C'est ce qui rend une attaque par carte graphique
 *   coûteuse : chaque essai doit réserver cette mémoire ;
 * - timeCost : 2 passes sur cette mémoire ;
 * - parallelism : 1 fil. Les hachages passent par le pool de threads de libuv (4 par défaut),
 *   qui borne le nombre de hachages simultanés par processus, et donc la mémoire (4 × 19 Mio).
 * Environ 60 ms par hachage sur un cœur actuel : imperceptible pour l'utilisateur, ruineux
 * pour qui teste des milliards de mots de passe.
 *
 * Le sel (16 octets aléatoires) et ces paramètres sont inscrits dans le hash lui-même
 * (format PHC « $argon2id$v=19$m=19456,t=2,p=1$... ») : les relever plus tard ne casse
 * aucun hash existant, et needsRehash() signale ceux qui sont à refaire.
 *
 * @typedef {object} Argon2Parameters
 * @property {0 | 1 | 2} type argon2.argon2id (2).
 * @property {number} memoryCost En Kio.
 * @property {number} timeCost
 * @property {number} parallelism
 */

/** @type {Readonly<Argon2Parameters>} */
export const ARGON2_PARAMETERS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

/**
 * Hachage et vérification des mots de passe (argon2id). Jamais bcrypt.
 *
 * @param {object} [options]
 * @param {Readonly<Argon2Parameters>} [options.parameters] Les tests peuvent passer des paramètres
 *   allégés ; la production utilise toujours ARGON2_PARAMETERS.
 */
export function createPasswordHasher({ parameters = ARGON2_PARAMETERS } = {}) {
  /** @type {Promise<string> | undefined} */
  let dummyHash;

  /** @param {string} password */
  const hash = (password) => argon2.hash(password, parameters);

  /**
   * @param {string} passwordHash
   * @param {string} password
   * @returns {Promise<boolean>} false aussi pour un hash illisible, sans lever d'erreur.
   */
  async function verify(passwordHash, password) {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  return {
    hash,
    verify,

    /**
     * Vrai si le hash a été fait avec d'autres paramètres que les actuels : il est alors refait
     * à la prochaine connexion réussie, quand le mot de passe est connu.
     *
     * @param {string} passwordHash
     * @returns {boolean}
     */
    needsRehash(passwordHash) {
      try {
        return argon2.needsRehash(passwordHash, parameters);
      } catch {
        return true;
      }
    },

    /**
     * Vérifie le mot de passe contre un hash factice, calculé une fois avec les mêmes
     * paramètres. Appelée quand le compte n'existe pas : la réponse prend alors le même temps
     * que pour un mauvais mot de passe, et sa durée ne révèle pas l'existence du compte.
     *
     * @param {string} password
     * @returns {Promise<false>}
     */
    async verifyDummy(password) {
      dummyHash ??= hash(randomBytes(32).toString('base64url'));
      await verify(await dummyHash, password);
      return false;
    },
  };
}

/** @typedef {ReturnType<typeof createPasswordHasher>} PasswordHasher */
