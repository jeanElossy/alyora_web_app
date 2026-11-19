import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { translateIssue } from './zod-messages.js';

/**
 * Formulaire React Hook Form validé par un schéma Zod, en général un schéma de
 * @alyora/shared : le client et l'API valident avec les mêmes règles. Les messages d'erreur
 * sont traduits (form.errors.* de l'espace de noms « ui ») ; ceux de Zod, en anglais, ne
 * s'affichent jamais. Validation au premier quitter d'un champ, puis à chaque frappe.
 *
 * @param {import('zod').ZodType<any, any>} schema
 * @param {Omit<import('react-hook-form').UseFormProps<any>, 'resolver'>} [options]
 * @returns {import('react-hook-form').UseFormReturn<any>}
 */
export function useZodForm(schema, options = {}) {
  const { t, i18n } = useTranslation('ui');
  const resolver = useMemo(
    () =>
      zodResolver(schema, {
        error: (/** @type {import('./zod-messages.js').ZodIssueInput} */ issue) =>
          translateIssue(issue, (key, values) => t(key, values ?? {})),
      }),
    [schema, t],
  );
  const form = useForm({ mode: 'onTouched', ...options, resolver });

  // Les messages sont traduits au moment de la validation : quand la langue change, les champs
  // en erreur sont revalidés, pour que leur message suive. Les erreurs renvoyées par l'API
  // (type "server") ne sont pas touchées.
  const { language } = i18n;
  useEffect(() => {
    const fields = Object.entries(form.formState.errors)
      .filter(([name, error]) => name !== 'root' && error?.type !== 'server')
      .map(([name]) => name);
    if (fields.length > 0) {
      void form.trigger(fields);
    }
  }, [language, form]);

  return form;
}
