import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jsonResponse } from '../../../test/api-doubles.js';
import { apiError, installFakeApi, renderApp } from '../../../test/fake-api.js';
import { useSessionStore } from '../../lib/session/session-store.js';
import { clearEmailedToken, readEmailedToken } from './emailed-token.js';
import { safeReturnPath } from './return-path.js';

/** @param {string} key @param {Record<string, unknown>} [values] */
const t = (key, values = {}) => i18next.t(key, values);

const TOKEN = 'T'.repeat(43);

beforeAll(async () => {
  await Promise.all([
    import('./auth-pages.jsx'),
    import('../../spaces/organizer/organizer-space.jsx'),
  ]);
});

afterEach(() => {
  useSessionStore.getState().clear();
  window.history.replaceState(null, '', '/');
});

describe('safeReturnPath', () => {
  const origin = 'https://app.alyora.ci';

  it.each([
    ['/organisateur/securite?onglet=2#x', '/organisateur/securite?onglet=2#x'],
    ['/admin', '/admin'],
  ])('keeps the in-app path %s', (value, expected) => {
    expect(safeReturnPath(value, '/home', origin)).toBe(expected);
  });

  it.each([
    null,
    '',
    'https://evil.example/organisateur',
    '//evil.example/x',
    '/\\evil.example',
    'javascript:alert(1)',
    'organisateur',
    '/a\u0000b',
  ])('falls back to the space home for %s', (value) => {
    expect(safeReturnPath(value, '/home', origin)).toBe('/home');
  });
});

describe('emailed tokens', () => {
  it('reads the token from the fragment, then erases it from the address', () => {
    window.history.replaceState(null, '', `/verifier-email?x=1#jeton=${TOKEN}`);

    expect(readEmailedToken()).toBe(TOKEN);
    clearEmailedToken();

    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?x=1');
  });

  it('ignores a malformed token', () => {
    window.history.replaceState(null, '', '/verifier-email#jeton=abc');

    expect(readEmailedToken()).toBeNull();
  });
});

describe('login page', () => {
  /** @param {import('@testing-library/user-event').UserEvent} user */
  async function fillCredentials(user) {
    await user.type(await screen.findByLabelText(/Adresse e-mail/), 'awa@exemple.ci');
    await user.type(screen.getByLabelText(/^Mot de passe/), 'Le soleil se lève');
    await user.click(screen.getByRole('button', { name: t('auth:login.submit') }));
  }

  it('signs in and goes back to the page asked for, when it is safe', async () => {
    const api = installFakeApi({
      'POST /auth/login': () => jsonResponse(200, { accessToken: 'a.b.c' }),
    });
    const user = userEvent.setup();
    const { router } = renderApp('/organisateur/connexion?retour=%2Forganisateur%2Fsecurite');

    await fillCredentials(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/organisateur/securite'));
    expect(useSessionStore.getState().accessToken).toBe('a.b.c');
    const [login] = api.callsTo('POST', '/auth/login');
    expect(login?.headers['X-CSRF-Token']).toBe('csrf-test-token');
    expect(login?.body).toEqual({ email: 'awa@exemple.ci', password: 'Le soleil se lève' });
  });

  it('never follows a return address to another site (open redirect)', async () => {
    installFakeApi({ 'POST /auth/login': () => jsonResponse(200, { accessToken: 'a.b.c' }) });
    const user = userEvent.setup();
    const { router } = renderApp('/organisateur/connexion?retour=https%3A%2F%2Fevil.example');

    await fillCredentials(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/organisateur'));
  });

  it('asks for the second factor when 2FA is on, then signs in', async () => {
    const api = installFakeApi({
      'POST /auth/login': () =>
        jsonResponse(200, { status: 'two_factor_required', challengeToken: TOKEN }),
      'POST /auth/2fa/verify': () => jsonResponse(200, { accessToken: 'a.b.c' }),
    });
    const user = userEvent.setup();
    const { router } = renderApp('/organisateur/connexion');

    await fillCredentials(user);
    expect(
      await screen.findByRole('heading', { level: 1, name: t('auth:twoFactorStep.title') }),
    ).toBeTruthy();
    expect(useSessionStore.getState().accessToken).toBeNull();
    await user.type(screen.getByLabelText(/Code de l’application/), '123456');
    await user.click(screen.getByRole('button', { name: t('auth:twoFactorStep.submit') }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/organisateur'));
    expect(api.callsTo('POST', '/auth/2fa/verify')[0]?.body).toEqual({
      challengeToken: TOKEN,
      otp: '123456',
    });
  });

  it('shows the invalid credentials message, and never tries a refresh for it', async () => {
    const api = installFakeApi({
      'POST /auth/login': () => apiError('INVALID_CREDENTIALS', 401),
    });
    const user = userEvent.setup();
    renderApp('/organisateur/connexion');

    await fillCredentials(user);

    expect((await screen.findByRole('alert')).textContent).toContain(
      t('common:errors.INVALID_CREDENTIALS'),
    );
    expect(api.callsTo('POST', '/auth/refresh')).toHaveLength(0);
  });
});

describe('registration page', () => {
  /** @param {import('@testing-library/user-event').UserEvent} user */
  async function fillRegistration(user) {
    await user.type(await screen.findByLabelText(/Prénom/), 'Awa');
    await user.type(screen.getByLabelText(/^Nom/), 'Koné');
    await user.type(screen.getByLabelText(/Adresse e-mail/), 'awa@exemple.ci');
    await user.type(screen.getByLabelText(/^Mot de passe/), 'Le soleil se lève sur la lagune');
    await user.click(screen.getByRole('button', { name: t('auth:register.submit') }));
  }

  it('sends an Idempotency-Key, then says to check the mailbox', async () => {
    const api = installFakeApi({
      'POST /auth/register': () => jsonResponse(202, { status: 'accepted' }),
    });
    const user = userEvent.setup();
    renderApp('/inscription');

    await fillRegistration(user);

    expect(
      await screen.findByRole('heading', { level: 1, name: t('auth:register.sentTitle') }),
    ).toBeTruthy();
    const [call] = api.callsTo('POST', '/auth/register');
    expect(call?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(call?.body).toMatchObject({ email: 'awa@exemple.ci', accountType: 'individual' });
  });

  it('keeps the key for a retry after a network failure, and changes it after an answer', async () => {
    let answers = 0;
    const api = installFakeApi({
      'POST /auth/register': () => {
        answers += 1;
        if (answers === 1) {
          throw new TypeError('Failed to fetch');
        }
        return jsonResponse(400, {
          code: 'VALIDATION_ERROR',
          message: 'x',
          details: { issues: [{ path: 'password', code: 'password_too_common', message: 'x' }] },
        });
      },
    });
    const user = userEvent.setup();
    renderApp('/inscription');

    await fillRegistration(user);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: t('auth:register.submit') }));
    expect(await screen.findByText(t('ui:form.errors.password_too_common'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t('auth:register.submit') }));
    await waitFor(() => expect(api.callsTo('POST', '/auth/register')).toHaveLength(3));

    const keys = api
      .callsTo('POST', '/auth/register')
      .map((call) => call.headers['Idempotency-Key']);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});

describe('e-mail verification page', () => {
  it('sends the token of the link once, erases it from the address, and confirms', async () => {
    const api = installFakeApi({
      'POST /auth/verify-email': () => jsonResponse(200, { status: 'email_verified' }),
    });
    window.history.replaceState(null, '', `/verifier-email#jeton=${TOKEN}`);

    renderApp('/verifier-email');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('auth:verifyEmail.verifiedTitle') }),
    ).toBeTruthy();
    expect(api.callsTo('POST', '/auth/verify-email')).toEqual([
      expect.objectContaining({ body: { token: TOKEN } }),
    ]);
    expect(window.location.hash).toBe('');
  });

  it('offers a new link when the token is no longer valid', async () => {
    installFakeApi({ 'POST /auth/verify-email': () => apiError('INVALID_TOKEN', 400) });
    window.history.replaceState(null, '', `/verifier-email#jeton=${TOKEN}`);

    renderApp('/verifier-email');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('auth:verifyEmail.invalidTitle') }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: t('auth:verifyEmail.resend') })).toBeTruthy();
  });
});

describe('password reset page', () => {
  it('replaces the password with the token of the link', async () => {
    const api = installFakeApi({
      'POST /auth/reset-password': () => jsonResponse(200, { status: 'password_reset' }),
    });
    window.history.replaceState(null, '', `/reinitialiser-mot-de-passe#jeton=${TOKEN}`);
    const user = userEvent.setup();
    renderApp('/reinitialiser-mot-de-passe');

    await user.type(await screen.findByLabelText(/Nouveau mot de passe/), 'Les pirogues au port');
    await user.click(screen.getByRole('button', { name: t('auth:reset.submit') }));

    expect(
      await screen.findByRole('heading', { level: 1, name: t('auth:reset.doneTitle') }),
    ).toBeTruthy();
    expect(api.callsTo('POST', '/auth/reset-password')[0]?.body).toEqual({
      token: TOKEN,
      password: 'Les pirogues au port',
    });
  });

  it('says the link is invalid without a token', async () => {
    installFakeApi({});

    renderApp('/reinitialiser-mot-de-passe');

    expect(
      await screen.findByRole('heading', { level: 1, name: t('auth:reset.invalidTitle') }),
    ).toBeTruthy();
  });
});
