import { Toast as RadixToast } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { cx } from './cx.js';
import { CloseIcon } from './icons.jsx';
import { useToastStore } from './toast-store.js';

/** Durée d'affichage d'une notification, en millisecondes. */
export const TOAST_DURATION_MS = 6_000;

const ACCENTS = { success: 'bg-forest', info: 'bg-champagne', error: 'bg-danger' };

/**
 * Zone des notifications (primitive Radix Toast), à monter une fois dans l'application :
 * annoncées aux lecteurs d'écran, atteignables au clavier (F8), fermées par Échap ou par un
 * glissement, mises en pause au survol et au focus. Leurs textes sont traduits ici, à chaque
 * rendu : une notification ouverte suit un changement de langue.
 */
export function Toaster() {
  const { t } = useTranslation('ui');
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <RadixToast.Provider label={t('toast.region')} duration={TOAST_DURATION_MS}>
      {toasts.map((item) => (
        <RadixToast.Root
          key={item.id}
          type={item.tone === 'error' ? 'foreground' : 'background'}
          onOpenChange={(open) => {
            if (!open) {
              dismiss(item.id);
            }
          }}
          className="relative flex items-start gap-3 overflow-hidden rounded-2xl border border-charcoal/10 bg-white p-4 pl-5 shadow-xl data-[state=open]:animate-slide-in-bottom data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y)"
        >
          <span
            aria-hidden="true"
            className={cx('absolute inset-y-0 left-0 w-1', ACCENTS[item.tone ?? 'info'])}
          />
          <div className="flex-1">
            <RadixToast.Title className="text-sm font-semibold text-forest">
              {t(item.title, { ns: item.ns, ...item.values })}
            </RadixToast.Title>
            {item.description ? (
              <RadixToast.Description className="mt-1 text-sm text-muted">
                {t(item.description, { ns: item.ns, ...item.values })}
              </RadixToast.Description>
            ) : null}
          </div>
          <RadixToast.Close
            aria-label={t('toast.close')}
            className="-mt-1 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-charcoal/5 hover:text-forest"
          >
            <CloseIcon className="h-4 w-4" />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-3 p-4 outline-none sm:right-0 sm:left-auto sm:w-full sm:max-w-sm sm:p-6" />
    </RadixToast.Provider>
  );
}
