import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, KEYS_LANGUAGE, registerNamespace } from '../../lib/i18n/i18n.js';
import { Button } from './Button.jsx';
import { Drawer } from './Drawer.jsx';
import { Modal } from './Modal.jsx';
import { Toaster } from './Toast.jsx';
import { toast, useToastStore } from './toast-store.js';
import { Tooltip } from './Tooltip.jsx';

/** Textes des notifications de test : elles reçoivent des clés, traduites à l'affichage. */
const TOAST_NAMESPACE = 'test-toast';
registerNamespace(TOAST_NAMESPACE, {
  sent: 'Invitation envoyée',
  soon: '{{name}} la recevra bientôt.',
});

afterEach(async () => {
  useToastStore.setState({ toasts: [], active: false });
  await i18next.changeLanguage(DEFAULT_LANGUAGE);
});

describe.each([
  ['Modal', Modal],
  ['Drawer', Drawer],
])('%s', (_name, Overlay) => {
  it('opens from its trigger, moves the focus in, closes with Escape and gives the focus back', async () => {
    const user = userEvent.setup();
    render(
      <Overlay
        title="Confirmer votre présence"
        description="Les mariés seront prévenus."
        trigger={<Button>Ouvrir</Button>}
      >
        <p>Contenu</p>
      </Overlay>,
    );

    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    await user.tab();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'Confirmer votre présence' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    const descriptionId = dialog.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(descriptionId)?.textContent).toBe('Les mariés seront prévenus.');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes with its translated close button', async () => {
    const user = userEvent.setup();
    render(
      <Overlay title="Détails" trigger={<Button>Ouvrir</Button>}>
        <p>Contenu</p>
      </Overlay>,
    );

    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const closeLabel = i18next.t(_name === 'Modal' ? 'ui:modal.close' : 'ui:drawer.close');
    await user.click(await screen.findByRole('button', { name: closeLabel }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Toast', () => {
  it('shows a notification pushed from anywhere, and closes it', async () => {
    const user = userEvent.setup();
    render(<Toaster />);

    act(() => {
      toast({ ns: TOAST_NAMESPACE, title: 'sent', description: 'soon', values: { name: 'Awa' } });
    });

    expect(await screen.findByText('Invitation envoyée')).toBeTruthy();
    expect(screen.getByText('Awa la recevra bientôt.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: i18next.t('ui:toast.close') }));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('translates an open notification again when the language changes', async () => {
    render(<Toaster />);
    act(() => {
      toast({ ns: TOAST_NAMESPACE, title: 'sent', description: 'soon', values: { name: 'Awa' } });
    });
    expect(await screen.findByText('Invitation envoyée')).toBeTruthy();

    await act(async () => {
      await i18next.changeLanguage(KEYS_LANGUAGE);
    });

    expect(screen.getByText('sent')).toBeTruthy();
    expect(screen.getByText('soon')).toBeTruthy();
    expect(screen.queryByText('Invitation envoyée')).toBeNull();
  });

  it('marks the notification area as needed only from the first notification', () => {
    expect(useToastStore.getState().active).toBe(false);

    toast({ ns: TOAST_NAMESPACE, title: 'sent' });

    expect(useToastStore.getState().active).toBe(true);
  });
});

describe('Tooltip', () => {
  it('appears when its trigger receives the keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="La réponse d'un invité">
        <Button variant="outline">Qu'est-ce qu'un RSVP ?</Button>
      </Tooltip>,
    );

    await user.tab();

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain("La réponse d'un invité");
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
