import { AppError } from '../errors/app-error.js';

/**
 * Dernier gestionnaire de route : toute requête qui l'atteint n'a correspondu à aucune route.
 *
 * @returns {import('express').RequestHandler}
 */
export function notFound() {
  return (_req, _res, next) => {
    next(new AppError('NOT_FOUND', { message: 'Route not found' }));
  };
}
