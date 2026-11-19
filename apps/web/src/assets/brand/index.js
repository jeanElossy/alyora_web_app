// Logo d'ALYORA, sur fond transparent, détouré du fichier source fourni par le responsable du
// projet. Trois versions : couleur (fonds clairs), nom en ivoire (fonds sombres) et emblème
// seul. En WebP, en deux largeurs : le navigateur prend la plus petite qui suffit (srcset).
import emblem96 from './alyora-emblem-96.webp';
import emblem192 from './alyora-emblem-192.webp';
import logoOnDark320 from './alyora-logo-on-dark-320.webp';
import logoOnDark640 from './alyora-logo-on-dark-640.webp';
import logo320 from './alyora-logo-320.webp';
import logo640 from './alyora-logo-640.webp';

/**
 * @typedef {object} BrandImage
 * @property {string} src
 * @property {string} srcSet Densités 1x et 2x.
 * @property {number} width Proportions de l'image (réservent sa place).
 * @property {number} height
 */

/**
 * @param {string} small
 * @param {string} large
 * @param {number} width
 * @param {number} height
 * @returns {BrandImage}
 */
const image = (small, large, width, height) => ({
  src: small,
  srcSet: `${small} 1x, ${large} 2x`,
  width,
  height,
});

export const BRAND = Object.freeze({
  /** Logo complet (emblème, nom, signature), pour les fonds clairs. */
  logo: image(logo320, logo640, 320, 188),
  /** Logo complet, nom et signature en ivoire, pour les fonds sombres (vert de la marque). */
  logoOnDark: image(logoOnDark320, logoOnDark640, 320, 188),
  /** Emblème seul : le A, le ruban et les alliances. */
  emblem: image(emblem96, emblem192, 96, 66),
});
