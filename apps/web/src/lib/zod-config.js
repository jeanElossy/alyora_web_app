import { z } from 'zod';

/**
 * Zod sans compilation à la volée : par défaut, il tente `new Function` pour accélérer ses
 * analyses, ce que la CSP de production interdit (script-src 'self', sans 'unsafe-eval'). La
 * tentative échouerait proprement, mais chaque échec serait signalé comme une violation de la
 * CSP. Importé en premier par main.jsx, avant toute analyse.
 */
z.config({ jitless: true });
