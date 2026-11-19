// Point d'entrée du processus worker : la file des e-mails (BullMQ).
// Le code métier (modèles, services, traitement des jobs) est importé de @alyora/api, jamais
// dupliqué ici. Importé sans être lancé (tests), ce module ne démarre rien.
import { startWorker } from './worker.js';

export { startWorker };

if (import.meta.main) {
  await startWorker();
}
