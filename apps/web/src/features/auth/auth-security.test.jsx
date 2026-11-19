import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { jsonResponse } from '../../../test/api-doubles.js';
import { CURRENT_USER, apiError, installFakeApi, renderApp } from '../../../test/fake-api.js';
import { useToastStore } from '../../components/ui/toast-store.js';
import { useSessionStore } from '../../lib/session/session-store.js';

/** @param {string} key @param {Record<string, unknown>} [values] */
const t = (key, values = {}) => i18next.t(key, values);

const SESSIONS = [
  {
    id: 'a'.repeat(24),
    deviceLabel: 'Chrome · Android',
    createdAt: '2026-11-19T10:00:00.000Z',
    lastSeenAt: '2026-11-19T10:30:00.000Z',
    current: true,
  },
  {
    id: 'b'.repeat(24),
    deviceLabel: 'Safari · iOS',
    createdAt: '2026-11-18T10:00:00.000Z',
    lastSeenAt: '2026-11-18T12:00:00.000Z',
    current: false,
  },
];

const BACKUP_CODES = [
  'ABCDE-FGH22',
  'ABCDE-FGH23',
  'ABCDE-FGH24',
  'ABCDE-FGH25',
  'ABCDE-FGH26',
  'ABCDE-FGH27',
  'ABCDE-FGH32',
  'ABCDE-FGH33',
];

/** @param {Record<string, import('../../../test/fake-api.js').FakeHandler>} [overrides] */
function accountApi(overrides = {}) {
  return installFakeApi({
    'GET /auth/me': () => jsonResponse(200, CURRENT_USER),
    'GET /auth/sessions': () => jsonResponse(200, { sessions: SESSIONS }),
    ...overrides,
  });
}

beforeAll(async () => {
  await Promise.all([
    import('./auth-pages.jsx'),
    import('../../spaces/organizer/organizer-space.jsx'),
  ]);
});

beforeEach(() => {
  useSessionStore.getState().setAccessToken('access.token.value');
});

afterEach(() => {
  useSessionStore.getState().clear();
  useToastStore.setState({ toasts: [], active: false });
});

describe('security page', () => {
  it('lists the devices, flags this one, and signs out another', async () => {
    const api = accountApi({
      [`DELETE /auth/sessions/${'b'.repeat(24)}`]: () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    renderApp('/organisateur/securite');

    expect(await screen.findByText('Safari · iOS')).toBeTruthy();
    expect(screen.getByText(t('auth:security.sessions.current'))).toBeTruthy();
    // Une seule session révocable : la courante ne l'est pas d'ici.
    const revoke = screen.getAllByRole('button', { name: t('auth:security.sessions.revoke') });
    expect(revoke).toHaveLength(1);
    await user.click(revoke[0] ?? document.body);

    await waitFor(() =>
      expect(api.callsTo('DELETE', `/auth/sessions/${'b'.repeat(24)}`)).toHaveLength(1),
    );
  });

  it('sets 2FA up with the QR code of the API, then shows the backup codes once', async () => {
    const api = accountApi({
      'POST /auth/2fa/setup': () =>
        jsonResponse(200, {
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/ALYORA:awa?secret=JBSWY3DPEHPK3PXP',
          qrCodeDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        }),
      'POST /auth/2fa/enable': () => jsonResponse(200, { backupCodes: BACKUP_CODES }),
    });
    const user = userEvent.setup();
    renderApp('/organisateur/securite');

    await user.click(
      await screen.findByRole('button', { name: t('auth:security.twoFactor.start') }),
    );
    const qr = await screen.findByRole('img', { name: t('auth:security.twoFactor.qrAlt') });
    expect(qr.getAttribute('src')).toBe('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
    expect(screen.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')).toBeTruthy();
    const form = screen.getByRole('form', { name: t('auth:security.twoFactor.enableLabel') });
    await user.type(within(form).getByLabelText(/Code de l’application/), '123456');
    await user.click(
      within(form).getByRole('button', { name: t('auth:security.twoFactor.enable') }),
    );

    expect(await screen.findByText(t('auth:security.twoFactor.codesTitle'))).toBeTruthy();
    for (const code of BACKUP_CODES) {
      expect(screen.getAllByText(code).length).toBeGreaterThan(0);
    }
    expect(api.callsTo('POST', '/auth/2fa/enable')[0]?.body).toEqual({ otp: '123456' });
  });

  it('asks to confirm the password when the API requires a recent authentication, then replays', async () => {
    let setups = 0;
    const api = accountApi({
      'POST /auth/2fa/setup': () => {
        setups += 1;
        return setups === 1
          ? apiError('REAUTHENTICATION_REQUIRED', 401)
          : jsonResponse(200, {
              secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
              otpauthUri: 'otpauth://totp/ALYORA:awa?secret=JBSWY3DPEHPK3PXP',
              qrCodeDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            });
      },
      'POST /auth/reauthenticate': () => jsonResponse(200, { accessToken: 'fresh.access.token' }),
    });
    const user = userEvent.setup();
    renderApp('/organisateur/securite');

    await user.click(
      await screen.findByRole('button', { name: t('auth:security.twoFactor.start') }),
    );
    const dialog = await screen.findByRole('dialog', { name: t('auth:reauth.title') });
    await user.type(within(dialog).getByLabelText(/^Mot de passe/), 'Le soleil se lève');
    await user.click(within(dialog).getByRole('button', { name: t('auth:reauth.submit') }));

    expect(
      await screen.findByRole('img', { name: t('auth:security.twoFactor.qrAlt') }),
    ).toBeTruthy();
    expect(api.callsTo('POST', '/auth/reauthenticate')[0]?.body).toEqual({
      password: 'Le soleil se lève',
    });
    expect(useSessionStore.getState().accessToken).toBe('fresh.access.token');
    // REAUTHENTICATION_REQUIRED n'est pas une session expirée : aucun refresh.
    expect(api.callsTo('POST', '/auth/refresh')).toHaveLength(0);
    expect(setups).toBe(2);
  });

  it('signs out from the header and goes back to the login page', async () => {
    const api = accountApi({ 'POST /auth/logout': () => new Response(null, { status: 204 }) });
    const user = userEvent.setup();
    const { router } = renderApp('/organisateur/securite');

    await user.click(await screen.findByRole('button', { name: 'Se déconnecter' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/organisateur/connexion'));
    expect(api.callsTo('POST', '/auth/logout')).toHaveLength(1);
    expect(useSessionStore.getState().accessToken).toBeNull();
  });
});

describe('profile page', () => {
  it('shows the account and saves a change, removing the phone when emptied', async () => {
    const api = accountApi({
      'PATCH /auth/me': ({ body }) => jsonResponse(200, { ...CURRENT_USER, ...body }),
    });
    const user = userEvent.setup();
    renderApp('/organisateur/profil');

    expect(await screen.findByText('awa@exemple.ci')).toBeTruthy();
    const firstName = screen.getByLabelText(/Prénom/);
    await user.clear(firstName);
    await user.type(firstName, 'Awa Marie');
    await user.click(screen.getByRole('button', { name: t('auth:profile.save') }));

    await waitFor(() => expect(api.callsTo('PATCH', '/auth/me')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/auth/me')[0]?.body).toMatchObject({
      firstName: 'Awa Marie',
      phone: null,
    });
  });
});
