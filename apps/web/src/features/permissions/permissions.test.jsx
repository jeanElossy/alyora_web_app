import { permissionsOfRole } from '@alyora/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../../../test/api-doubles.js';
import { apiError, installFakeApi } from '../../../test/fake-api.js';
import { createQueryClient } from '../../app/query-client.js';
import { useSessionStore } from '../../lib/session/session-store.js';
import { Can } from './Can.jsx';
import { usePermissions } from './use-permissions.js';

const EVENT_ID = '6b0790c7ff6f6a3544c1b7bb';
const PATH = `/events/${EVENT_ID}/permissions/me`;

/** @param {import('@alyora/shared').RoleKey} key */
const answerAs = (key) => () =>
  jsonResponse(200, {
    eventId: EVENT_ID,
    role: { type: 'predefined', key },
    permissions: permissionsOfRole(key),
  });

/** @param {{ children?: import('react').ReactNode }} props */
function Providers({ children }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

/**
 * Sans nouvelle tentative : une réponse invalide (erreur Zod) est sinon réessayée deux fois,
 * avec des délais croissants (comportement du client de requêtes, testé ailleurs).
 *
 * @param {{ children?: import('react').ReactNode }} props
 */
function ProvidersWithoutRetry({ children }) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useSessionStore.getState().setAccessToken('access.token.value');
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionStore.getState().clear();
});

describe('usePermissions', () => {
  it('reads the permissions of the signed-in account on the event, through the API client', async () => {
    const api = installFakeApi({ [`GET ${PATH}`]: answerAs('reader') });

    const { result } = renderHook(() => usePermissions(EVENT_ID), { wrapper: Providers });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.can('guests:read')).toBe(false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toEqual({ type: 'predefined', key: 'reader' });
    expect(result.current.can('guests:read')).toBe(true);
    expect(result.current.can('guests:write')).toBe(false);
    expect(api.callsTo('GET', PATH)[0]?.headers.Authorization).toBe('Bearer access.token.value');
  });

  it('answers no when the API refuses, or answers something unexpected', async () => {
    installFakeApi({ [`GET ${PATH}`]: () => apiError('NOT_FOUND', 404) });
    const refused = renderHook(() => usePermissions(EVENT_ID), { wrapper: Providers });
    await waitFor(() => expect(refused.result.current.isError).toBe(true));
    expect(refused.result.current.can('event:read')).toBe(false);
    vi.unstubAllGlobals();

    installFakeApi({
      [`GET ${PATH}`]: () =>
        jsonResponse(200, { eventId: EVENT_ID, role: { type: 'explicit' }, permissions: ['*'] }),
    });
    const invalid = renderHook(() => usePermissions(EVENT_ID), { wrapper: ProvidersWithoutRetry });
    await waitFor(() => expect(invalid.result.current.isError).toBe(true));
    expect(invalid.result.current.permissions).toEqual([]);
  });

  it('asks nothing without an event, and refuses an unknown permission', () => {
    const api = installFakeApi({});

    const { result } = renderHook(() => usePermissions(null), { wrapper: Providers });

    expect(result.current.isLoading).toBe(false);
    expect(api.calls).toEqual([]);
    expect(() => result.current.can(/** @type {any} */ ('guests:delete'))).toThrow(
      /unknown permission/,
    );
  });
});

describe('<Can>', () => {
  /** @param {{ permission: import('@alyora/shared').Permission }} props */
  const Example = ({ permission }) => (
    <Can eventId={EVENT_ID} permission={permission} fallback={<p>refusé</p>}>
      <button type="button">action</button>
    </Can>
  );

  it('shows its children only once the permission is known to be held', async () => {
    installFakeApi({ [`GET ${PATH}`]: answerAs('editor') });

    const { container } = render(<Example permission="guests:write" />, { wrapper: Providers });

    expect(container.innerHTML).toBe('');
    expect(await screen.findByRole('button', { name: 'action' })).toBeTruthy();
  });

  it('shows the fallback when the permission is missing', async () => {
    installFakeApi({ [`GET ${PATH}`]: answerAs('checkin_agent') });

    render(<Example permission="contributions:read" />, { wrapper: Providers });

    expect(await screen.findByText('refusé')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the fallback when the permissions cannot be read (event of another tenant)', async () => {
    installFakeApi({ [`GET ${PATH}`]: () => apiError('NOT_FOUND', 404) });

    render(<Example permission="event:read" />, { wrapper: Providers });

    expect(await screen.findByText('refusé')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('asks the API once for every <Can> of the same event', async () => {
    const api = installFakeApi({ [`GET ${PATH}`]: answerAs('owner') });

    render(
      <>
        <Example permission="guests:write" />
        <Example permission="payouts:manage" />
        <Example permission="settings:manage" />
      </>,
      { wrapper: Providers },
    );

    expect(await screen.findAllByRole('button', { name: 'action' })).toHaveLength(3);
    expect(api.callsTo('GET', PATH)).toHaveLength(1);
  });
});
