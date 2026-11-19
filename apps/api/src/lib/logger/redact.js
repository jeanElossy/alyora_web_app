/** Valeur de remplacement d'un champ masqué. */
export const REDACTED = '[REDACTED]';

/**
 * Termes sensibles reconnus n'importe où dans le nom du champ, une fois celui-ci mis en
 * minuscules et débarrassé de ses séparateurs : "newPassword", "refresh_token", "set-cookie",
 * "subscriberMsisdn", "bank_account_number"... Un faux positif masque seulement une valeur
 * ("discard" contient "card"), un faux négatif la laisse fuir.
 */
const SENSITIVE_SUBSTRINGS = Object.freeze([
  'authorization',
  'cookie',
  'password',
  'passwd',
  'motdepasse',
  'secret',
  'token',
  'credential',
  'signature',
  'apikey',
  'privatekey',
  'accesskey',
  'email',
  'phone',
  'mobile',
  'whatsapp',
  'msisdn',
  // MTN MoMo : le numéro du payeur est transmis dans "partyId".
  'partyid',
  'wallet',
  'accountnumber',
  'iban',
  'card',
  'cvv',
]);

/**
 * Termes trop courts pour être cherchés dans tout le nom : ils ne comptent que s'ils forment
 * un mot entier ("pinCode", "otp", "internal_note"), sinon "mapping" contiendrait "pin",
 * "footprint" "otp" et "company" "pan".
 */
const SENSITIVE_WORDS = new Set(['pin', 'otp', 'cvc', 'pan', 'tel', 'note', 'notes']);

/**
 * Résultats déjà calculés : un logger revoit sans cesse les mêmes noms de champs.
 *
 * @type {Map<string, boolean>}
 */
const sensitivityByKey = new Map();
const MAX_CACHED_KEYS = 1_000;

/**
 * Dit si un nom de champ désigne une donnée sensible (identifiant, secret, coordonnée de
 * contact ou de paiement, note interne), quelle que soit sa casse et son style d'écriture
 * (camelCase, snake_case, kebab-case).
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  const cached = sensitivityByKey.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const words = splitWords(key);
  const compact = words.join('');
  const sensitive =
    words.some((word) => SENSITIVE_WORDS.has(word)) ||
    SENSITIVE_SUBSTRINGS.some((term) => compact.includes(term));
  if (sensitivityByKey.size >= MAX_CACHED_KEYS) {
    sensitivityByKey.clear();
  }
  sensitivityByKey.set(key, sensitive);
  return sensitive;
}

/**
 * "subscriberMSISDN" -> ["subscriber", "msisdn"], "OTPCode" -> ["otp", "code"],
 * "refresh_token" -> ["refresh", "token"].
 *
 * @param {string} key
 * @returns {string[]}
 */
function splitWords(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const MAX_DEPTH = 10;

/**
 * Renvoie une copie de `value` dans laquelle :
 * - toute propriété au nom sensible est remplacée par REDACTED, à toute profondeur, tableaux
 *   compris (masquage par nom) ;
 * - toute occurrence d'un secret connu dans une chaîne est remplacée par REDACTED, quel que
 *   soit le champ (masquage par valeur : attrape un mot de passe cité dans un message d'erreur).
 * L'entrée n'est jamais modifiée.
 *
 * Seuls les objets simples et les tableaux sont parcourus. Les autres objets (Error, Date,
 * Buffer, instances de classe) sont renvoyés tels quels : le logger ne parcourt que du JSON
 * déjà analysé, où il n'en reste aucun.
 *
 * @param {unknown} value
 * @param {ReadonlyArray<string>} [secrets] Valeurs exactes à effacer, les plus longues d'abord.
 * @returns {unknown}
 */
export function redactSensitive(value, secrets = []) {
  return walk(value, 0, new WeakSet(), secrets);
}

/**
 * Identique à redactSensitive, typé pour un objet de log.
 *
 * @param {Record<string, unknown>} record
 * @param {ReadonlyArray<string>} [secrets]
 * @returns {Record<string, unknown>}
 */
export function redactRecord(record, secrets = []) {
  return /** @type {Record<string, unknown>} */ (redactSensitive(record, secrets));
}

/** Écrite à la place d'une ligne illisible, qui n'est jamais écrite telle quelle. */
const UNPARSABLE_LINE = `${JSON.stringify({ level: 'error', msg: 'Unparsable log line dropped' })}\n`;

/**
 * Masque une ligne de log JSON sérialisée. Utilisée comme hook streamWrite de pino : la
 * dernière étape avant la sortie, après les liaisons, les loggers enfants et les
 * sérialiseurs, si bien que rien ne peut y échapper. (Pino réinitialise son formateur de
 * liaisons sur chaque logger enfant : un formateur ne verrait pas les champs liés par
 * pino-http ou par `logger.child()`.) Coûte une analyse JSON par ligne.
 *
 * @param {string} line
 * @param {ReadonlyArray<string>} [secrets] Valeurs de la requête en cours à effacer.
 * @returns {string}
 */
export function redactLine(line, secrets = []) {
  try {
    const redacted = JSON.stringify(redactSensitive(JSON.parse(line), secrets));
    return line.endsWith('\n') ? `${redacted}\n` : redacted;
  } catch {
    return UNPARSABLE_LINE;
  }
}

/**
 * @param {unknown} value
 * @param {number} depth
 * @param {WeakSet<object>} ancestors Objets du chemin courant, pour détecter les cycles.
 * @param {ReadonlyArray<string>} secrets
 * @returns {unknown}
 */
function walk(value, depth, ancestors, secrets) {
  if (typeof value === 'string') {
    return scrub(value, secrets);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) {
    return value;
  }
  if (ancestors.has(value)) {
    return '[Circular]';
  }
  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }

  ancestors.add(value);
  /** @type {unknown} */
  let copy;
  if (isArray) {
    copy = value.map((item) => walk(item, depth + 1, ancestors, secrets));
  } else {
    /** @type {Record<string, unknown>} */
    const record = {};
    for (const [key, item] of Object.entries(value)) {
      record[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1, ancestors, secrets);
    }
    copy = record;
  }
  ancestors.delete(value);
  return copy;
}

/**
 * @param {string} text
 * @param {ReadonlyArray<string>} secrets
 * @returns {string}
 */
function scrub(text, secrets) {
  let result = text;
  for (const secret of secrets) {
    if (result.includes(secret)) {
      result = result.replaceAll(secret, REDACTED);
    }
  }
  return result;
}

/**
 * @param {object} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
