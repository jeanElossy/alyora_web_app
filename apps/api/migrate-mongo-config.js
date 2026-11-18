// Configuration de migrate-mongo, lue par les scripts migrate:*.
// MONGODB_URI passe par la même validation Zod que l'API. Ce fichier ne lit que
// l'environnement : ce sont les scripts migrate:* qui chargent apps/api/.env
// (node --env-file-if-exists=.env), comme le script dev. Un test qui lance la commande
// directement ne voit donc jamais le .env d'un développeur ni sa base réelle.
import { loadMongoUri } from './src/config/load-config.js';

const config = {
  mongodb: {
    url: loadMongoUri(process.env),
    options: {},
  },
  migrationsDir: 'migrations',
  // Collections techniques : la règle du filtre par locataire (eventId / organizationId) ne
  // s'applique pas.
  changelogCollectionName: 'migrations_changelog',
  lockCollectionName: 'migrations_lock',
  // Deux déploiements lancés en même temps ne peuvent pas exécuter les migrations deux fois.
  lockTtl: 300,
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'esm',
};

export default config;
