import { Dialog } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from './icons.jsx';

/**
 * @typedef {object} ModalProps
 * @property {string} title Déjà traduit ; nom accessible de la fenêtre.
 * @property {string} [description]
 * @property {import('react').ReactNode} [trigger] Élément qui ouvre la fenêtre (un Button).
 * @property {boolean} [open] Mode contrôlé.
 * @property {(open: boolean) => void} [onOpenChange]
 * @property {import('react').ReactNode} children
 * @property {import('react').ReactNode} [footer] Actions, alignées à droite sur grand écran.
 */

/**
 * Fenêtre modale (primitive Radix Dialog) : focus piégé dans la fenêtre, fermeture par Échap
 * ou par le bouton dédié, focus rendu au déclencheur à la fermeture, reste de la page masqué
 * aux lecteurs d'écran.
 *
 * @param {ModalProps} props
 */
export function Modal({ title, description, trigger, open, onOpenChange, children, footer }) {
  const { t } = useTranslation('ui');

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          // Sans description, Radix demande aria-describedby={undefined} explicitement.
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2.5rem)] w-[calc(100%-2.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl data-[state=open]:animate-zoom-in sm:p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-2xl leading-tight font-semibold text-forest">
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t('modal.close')}
              className="-mt-1 -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-charcoal/5 hover:text-forest"
            >
              <CloseIcon />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
              {description}
            </Dialog.Description>
          ) : null}
          <div className="mt-6">{children}</div>
          {footer ? (
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Bouton qui ferme la fenêtre ou le panneau qui le contient : à placer dans `footer`. */
export const ModalClose = Dialog.Close;
