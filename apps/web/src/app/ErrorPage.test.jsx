import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/api-error.js';
import { ErrorPage, describeError } from './ErrorPage.jsx';

/** @param {string} key @param {Record<string, string>} [values] */
const t = (key, values = {}) => i18next.t(key, values);

/** @param {() => never} fail */
function renderFailingRoute(fail) {
  const router = createMemoryRouter([
    { path: '/', loader: fail, Component: () => null, ErrorBoundary: ErrorPage },
  ]);
  render(<RouterProvider router={router} />);
}

describe('ErrorPage', () => {
  it('shows the translated message of an API error and its reference, nothing technical', async () => {
    renderFailingRoute(() => {
      throw new ApiError({
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
        message: 'Upstream mongodb://db:27017 exploded',
        requestId: 'req-0123456789',
      });
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t('errors.SERVICE_UNAVAILABLE'));
    expect(alert.textContent).toContain(t('errorPage.reference', { requestId: 'req-0123456789' }));
    expect(alert.textContent).not.toMatch(/mongodb|exploded|503|Error/);
  });

  it('shows a generic message for any other error, never its message nor its stack', async () => {
    // React journalise l'erreur capturée par la frontière : attendu, et sans intérêt ici.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderFailingRoute(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'guests') at db.js:12");
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t('errors.INTERNAL_ERROR'));
    expect(alert.textContent).not.toMatch(/Cannot read|db\.js|TypeError|guests/);
    expect(screen.getByRole('link', { name: t('errorPage.home') }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('button', { name: t('errorPage.retry') })).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe('describeError', () => {
  it('recognizes a missing page', async () => {
    const router = createMemoryRouter(
      [{ path: '/', Component: () => null, ErrorBoundary: ErrorPage }],
      { initialEntries: ['/chemin-inconnu'] },
    );
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: t('errorPage.notFoundTitle') }),
    ).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain(t('errors.NOT_FOUND'));
  });

  it('describes an unknown thrown value as an internal error', () => {
    expect(describeError('a string was thrown')).toEqual({
      titleKey: 'errorPage.title',
      messageKey: 'errors.INTERNAL_ERROR',
    });
  });
});
