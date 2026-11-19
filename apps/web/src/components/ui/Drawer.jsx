import { Dialog } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from './icons.jsx';

/**
 * @typedef {object} DrawerProps
 * @property {string} title Déjà traduit ; nom accessible du panneau.
 * @property {string} [description]
 * @property {import('react').ReactNode} [trigger]
 * @property {boolean} [open]
 * @property {(open: boolean) => void} [onOpenChange]
 * @property {import('react').ReactNode} children
 * @property {import('react').ReactNode} [footer]
 */

/**
 * Panneau latéral (primitive Radix Dialog) : il monte du bas de l'écran sur mobile, glisse
 * depuis la droite sur grand écran. Mêmes garanties que la Modal : focus piégé, Échap, focus
 * rendu au déclencheur.
 *
 * @param {DrawerProps} props
 */
export function Drawer({ title, description, trigger, open, onOpenChange, children, footer }) {
  const { t } = useTranslation('ui');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          // Sans description, Radix demande aria-describedby={undefined} explicitement.
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl bg-white shadow-2xl data-[state=open]:animate-slide-in-bottom sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-3xl sm:data-[state=open]:animate-slide-in-right"
        >
          <span
            aria-hidden="true"
            className="mx-auto mt-3 block h-1 w-10 rounded-full bg-charcoal/15 sm:hidden"
          />
          <div className="flex items-start justify-between gap-4 border-b border-charcoal/10 px-6 pt-5 pb-4 sm:pt-8">
            <div>
              <Dialog.Title className="font-display text-2xl leading-tight font-semibold text-forest">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label={t('drawer.close')}
              className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-charcoal/5 hover:text-forest"
            >
              <CloseIcon />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-3 border-t border-charcoal/10 px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
