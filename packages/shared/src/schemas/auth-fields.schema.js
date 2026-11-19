import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  EMAIL_MAX_LENGTH,
  LOCALES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PERSON_NAME_MAX_LENGTH,
} from '../constants/auth.js';

/**
 * Adresse e-mail normalisée : espaces retirés, en minuscules. C'est sous cette forme qu'elle
 * est stockée et comparée, si bien que « Awa@Exemple.CI » et « awa@exemple.ci » désignent le
 * même compte.
 */
export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email());

/**
 * Nouveau mot de passe : longueur seulement. Jamais de transformation (pas de trim) : un espace
 * fait partie du mot de passe. Le refus des mots de passe courants est fait par l'API, qui
 * embarque la liste.
 */
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** Mot de passe saisi pour se connecter : aucune règle autre que la borne de longueur. */
export const passwordInputSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

/** Prénom ou nom. */
export const personNameSchema = z.string().trim().min(1).max(PERSON_NAME_MAX_LENGTH);

/** Numéro de téléphone au format international E.164 (« +2250700000000 »). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/);

export const accountTypeSchema = z.enum(ACCOUNT_TYPES);

export const localeSchema = z.enum(LOCALES);

/** @type {Set<string> | undefined} */
let knownTimeZones;

/**
 * @param {string} value
 * @returns {boolean}
 */
function isTimeZone(value) {
  knownTimeZones ??= new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
  return knownTimeZones.has(value);
}

/** Fuseau horaire IANA (« Africa/Abidjan »). */
export const timeZoneSchema = z.string().refine(isTimeZone, { message: 'Unknown time zone' });

/**
 * Jeton envoyé par e-mail (vérification, réinitialisation) : 256 bits d'aléa en base64url,
 * soit 43 caractères. Tout autre format est refusé avant d'interroger la base.
 */
export const emailedTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export { DEFAULT_LOCALE, DEFAULT_TIMEZONE };
