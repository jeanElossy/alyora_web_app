/** Longueur maximale du User-Agent conservé avec une session. */
export const MAX_USER_AGENT_LENGTH = 512;

/** Navigateurs, dans l'ordre où les chercher (Edge et Opera se déclarent aussi « Chrome »). */
const BROWSERS = /** @type {const} */ ([
  ['Edge', /\bEdg(e|A|iOS)?\//],
  ['Opera', /\b(OPR|Opera)\//],
  ['Samsung Internet', /\bSamsungBrowser\//],
  ['Firefox', /\b(Firefox|FxiOS)\//],
  ['Chrome', /\b(Chrome|CriOS)\//],
  ['Safari', /\bVersion\/[\d.]+.*\bSafari\//],
]);

const SYSTEMS = /** @type {const} */ ([
  ['Android', /\bAndroid\b/],
  ['iOS', /\b(iPhone|iPad|iPod)\b/],
  ['ChromeOS', /\bCrOS\b/],
  ['Windows', /\bWindows\b/],
  ['macOS', /\bMac OS X\b/],
  ['Linux', /\bLinux\b/],
]);

/**
 * Libellé lisible d'un appareil, déduit du User-Agent sans bibliothèque : « Chrome · Android ».
 * Indicatif seulement (un User-Agent se falsifie) : il aide le titulaire à reconnaître ses
 * sessions, il ne prouve rien. « Unknown » pour ce qui n'est pas reconnu.
 *
 * @param {string} userAgent
 * @returns {string}
 */
export function describeDevice(userAgent) {
  const browser = BROWSERS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? 'Unknown';
  const system = SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? 'Unknown';
  return `${browser} · ${system}`;
}

/**
 * @param {string | undefined} userAgent
 * @returns {string}
 */
export function truncateUserAgent(userAgent) {
  return (userAgent ?? '').slice(0, MAX_USER_AGENT_LENGTH);
}
