// Rapport des bundles par espace, lancé après `vite build`. Échoue si le bundle initial de
// l'espace public dépasse son budget.
//
// Bundle initial d'un espace : le point d'entrée (index.html), le bundle de l'espace, leurs
// imports statiques, et leurs feuilles de style. Les polices n'y sont pas : elles sont
// chargées à part, et seulement les sous-ensembles dont la page a besoin (unicode-range).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Budget du bundle initial de l'espace public, compressé en gzip (1 Ko = 1 000 octets). */
export const PUBLIC_BUDGET_BYTES = 180_000;

/** Module de chaque espace, tel que Vite le nomme dans son manifeste. */
export const SPACE_MODULES = Object.freeze({
  public: 'src/spaces/public/public-space.jsx',
  organizer: 'src/spaces/organizer/organizer-space.jsx',
  checkin: 'src/spaces/checkin/checkin-space.jsx',
  admin: 'src/spaces/admin/admin-space.jsx',
});

const ENTRY = 'index.html';

/**
 * @typedef {object} ManifestChunk
 * @property {string} file
 * @property {string[]} [imports]
 * @property {string[]} [css]
 */

/**
 * Fichiers chargés d'office avec les modules donnés : leurs fichiers, leurs imports statiques
 * (récursivement) et leurs CSS. Les imports dynamiques (autres espaces) sont exclus.
 *
 * @param {Record<string, ManifestChunk>} manifest
 * @param {string[]} keys
 * @returns {string[]}
 */
export function initialFiles(manifest, keys) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Set<string>} */
  const files = new Set();
  /** @param {string} key */
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(key)) {
      return;
    }
    seen.add(key);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) {
      files.add(css);
    }
    for (const imported of chunk.imports ?? []) {
      visit(imported);
    }
  };
  keys.forEach(visit);
  return [...files];
}

/**
 * @param {URL} dist
 * @param {string[]} files
 * @returns {number} Taille gzip totale, en octets.
 */
function gzippedSize(dist, files) {
  return files.reduce(
    (total, file) => total + gzipSync(readFileSync(new URL(file, dist))).length,
    0,
  );
}

/** @param {number} bytes */
function kilobytes(bytes) {
  return `${(bytes / 1000).toFixed(1)} Ko`;
}

function main() {
  const dist = new URL('../dist/', import.meta.url);
  const manifestUrl = new URL('.vite/manifest.json', dist);
  if (!existsSync(manifestUrl)) {
    process.stderr.write('Manifeste Vite introuvable : lancer vite build avant ce script.\n');
    process.exit(1);
  }
  /** @type {Record<string, ManifestChunk>} */
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));

  const lines = ['', 'Bundles par espace (gzip) :'];
  let publicSize = 0;
  for (const [space, module] of Object.entries(SPACE_MODULES)) {
    const chunk = manifest[module];
    if (!chunk) {
      process.stderr.write(`Espace ${space} absent du manifeste (${module}).\n`);
      process.exit(1);
    }
    const ownSize = gzippedSize(dist, [chunk.file]);
    const initialSize = gzippedSize(dist, initialFiles(manifest, [ENTRY, module]));
    if (space === 'public') {
      publicSize = initialSize;
    }
    lines.push(
      `  ${space.padEnd(10)} ${chunk.file.padEnd(36)} propre ${kilobytes(ownSize).padStart(9)}` +
        `   initial ${kilobytes(initialSize).padStart(9)}`,
    );
  }

  const withinBudget = publicSize <= PUBLIC_BUDGET_BYTES;
  lines.push(
    '',
    `Budget de l'espace public : ${kilobytes(publicSize)} sur ${kilobytes(PUBLIC_BUDGET_BYTES)}` +
      (withinBudget ? ' : respecté.' : ' : DÉPASSÉ.'),
    '',
  );
  (withinBudget ? process.stdout : process.stderr).write(lines.join('\n'));
  if (!withinBudget) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
