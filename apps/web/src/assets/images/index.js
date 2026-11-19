// Photos d'ambiance des pages. Générées par Figma AI (modèle gpt-image-2.5-flare) pour
// ALYORA : aucune personne réelle, aucun texte. Chaque photo existe en plusieurs largeurs
// (WebP) : le navigateur choisit la plus petite qui suffit à l'écran (srcset et sizes).
import ceremony480 from './ceremony-480.webp';
import ceremony768 from './ceremony-768.webp';
import ceremony1024 from './ceremony-1024.webp';
import confirm480 from './confirm-480.webp';
import confirm800 from './confirm-800.webp';
import invite480 from './invite-480.webp';
import invite800 from './invite-800.webp';
import reception640 from './reception-640.webp';
import reception1024 from './reception-1024.webp';
import welcome480 from './welcome-480.webp';
import welcome800 from './welcome-800.webp';

/**
 * @typedef {object} Photo
 * @property {string} src La plus grande version, pour les navigateurs sans srcset.
 * @property {string} srcSet
 * @property {number} width Dimensions de la plus grande version : réservent la place de
 *   l'image avant son chargement (pas de décalage de la mise en page).
 * @property {number} height
 */

/**
 * @param {Record<number, string>} sources URL de chaque version, par largeur.
 * @param {number} height Hauteur de la plus grande version.
 * @returns {Photo}
 */
function photo(sources, height) {
  const widths = Object.keys(sources).map(Number);
  const width = Math.max(...widths);
  return {
    src: /** @type {string} */ (sources[width]),
    srcSet: widths.map((w) => `${sources[w]} ${w}w`).join(', '),
    width,
    height,
  };
}

export const PHOTOS = Object.freeze({
  /** Arche de cérémonie fleurie, au crépuscule (portrait). */
  ceremony: photo({ 480: ceremony480, 768: ceremony768, 1024: ceremony1024 }, 1280),
  /** Table de réception aux bougies (portrait). */
  reception: photo({ 640: reception640, 1024: reception1024 }, 1280),
  /** Faire-part vierge scellé à la cire. */
  invite: photo({ 480: invite480, 800: invite800 }, 600),
  /** Réponse envoyée depuis un téléphone. */
  confirm: photo({ 480: confirm480, 800: confirm800 }, 600),
  /** Arrivée des invités à la réception. */
  welcome: photo({ 480: welcome480, 800: welcome800 }, 600),
});
