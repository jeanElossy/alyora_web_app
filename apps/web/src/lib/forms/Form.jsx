import { useEffect, useRef } from 'react';
import { FormProvider } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { applyServerErrors } from './server-errors.js';

/**
 * @typedef {object} FormProps
 * @property {import('react-hook-form').UseFormReturn<any>} form Rendu par useZodForm.
 * @property {(values: any) => Promise<void> | void} onSubmit Reçoit les valeurs validées.
 * @property {import('react').ReactNode} children
 * @property {string} [className] Mise en page des champs (grille, espacements).
 * @property {string} [aria-label]
 */

/**
 * Formulaire branché sur React Hook Form :
 * - validation du navigateur coupée (noValidate) : les messages viennent du schéma, traduits ;
 * - pendant l'envoi, tous les contrôles sont désactivés (fieldset disabled), bouton compris ;
 * - une erreur de l'envoi s'affiche en tête du formulaire et, pour une erreur de validation de
 *   l'API, sous chaque champ concerné ; le premier reçoit le focus dès que le formulaire est
 *   réactivé.
 *
 * @param {FormProps} props
 */
export function Form({ form, onSubmit, children, className, ...props }) {
  const { t } = useTranslation('ui');
  /** Champ à focaliser après l'envoi : pendant l'envoi, il est désactivé. @type {import('react').RefObject<string | undefined>} */
  const focusAfterSubmit = useRef(undefined);
  const { isSubmitting } = form.formState;

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  const submit = (event) =>
    form.handleSubmit(async (values) => {
      form.clearErrors('root');
      try {
        await onSubmit(values);
      } catch (error) {
        focusAfterSubmit.current = applyServerErrors(form, error);
      }
    })(event);

  useEffect(() => {
    if (!isSubmitting && focusAfterSubmit.current) {
      form.setFocus(focusAfterSubmit.current);
      focusAfterSubmit.current = undefined;
    }
  }, [isSubmitting, form]);
  // Clé de traduction (« common »), traduite ici à chaque rendu : elle suit la langue.
  const rootErrorKey = form.formState.errors.root?.server?.message;

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={submit} {...props}>
        {/* min-w-0 : un fieldset garde sinon la largeur de son contenu, et déborde en 360 px. */}
        <fieldset
          disabled={isSubmitting}
          className={className ? `min-w-0 ${className}` : 'min-w-0'}
        >
          {rootErrorKey ? (
            <div
              role="alert"
              className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              <p className="font-medium">{t('form.submitFailed')}</p>
              <p className="mt-1">{t(rootErrorKey, { ns: 'common' })}</p>
            </div>
          ) : null}
          {children}
        </fieldset>
      </form>
    </FormProvider>
  );
}
