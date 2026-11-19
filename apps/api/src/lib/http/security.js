import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { CORRELATION_HEADER } from './correlation.js';

/** Taille maximale d'un corps JSON. Les fichiers ne passent jamais par l'API (envoi direct). */
export const JSON_BODY_LIMIT = '100kb';

/** En-têtes de sécurité (valeurs par défaut de helmet : CSP stricte, HSTS, nosniff, anti-iframe...). */
export function securityHeaders() {
  return helmet();
}

/**
 * CORS limité à une liste explicite d'origines. Une requête d'une autre origine ne reçoit
 * aucun en-tête CORS, donc le navigateur la bloque. Les requêtes sans en-tête Origin (de
 * serveur à serveur, sondes, curl) ne sont pas concernées par CORS.
 * Les credentials sont autorisés pour le cookie du refresh token.
 *
 * @param {string[]} allowedOrigins
 */
export function corsWhitelist(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return cors({
    origin: (origin, callback) => {
      callback(null, origin !== undefined && allowed.has(origin));
    },
    credentials: true,
    exposedHeaders: [CORRELATION_HEADER, 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  });
}

/**
 * Réponses qui peuvent porter un secret (jeton, données du compte) : jamais mises en cache, ni
 * par le navigateur ni par un intermédiaire, et jamais compressées. `no-transform` fait
 * renoncer le middleware de compression : compresser un secret à côté d'une donnée choisie
 * par l'attaquant ouvre la voie aux attaques de type BREACH.
 *
 * @returns {import('express').RequestHandler}
 */
export function noStore() {
  return (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-transform');
    next();
  };
}

/** Compression des réponses (gzip/deflate) au-delà de 1 ko. */
export function responseCompression() {
  return compression();
}

/** Lecture des corps JSON, de taille bornée. Les autres types de contenu ne sont pas lus. */
export function jsonBody() {
  return express.json({ limit: JSON_BODY_LIMIT });
}
