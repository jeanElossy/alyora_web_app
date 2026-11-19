import { otpSchema, passwordInputSchema } from '@alyora/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Modal } from '../../../components/ui/Modal.jsx';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { authApi } from '../auth-api.js';
import { NAMESPACE } from '../namespace.js';
import { PasswordInput } from './PasswordInput.jsx';

/**
 * @typedef {object} ReauthDialogProps
 * @property {boolean} open
 * @property {boolean} twoFactorEnabled Le code de l'application est alors demandé aussi.
 * @property {() => void} onConfirmed
 * @property {() => void} onCancelled
 */

/**
 * Confirmation du mot de passe (et du code 2FA) avant une opération sensible. Réussie, elle
 * renouvelle l'access token (auth_time à jour) ; l'opération en attente est alors rejouée.
 *
 * @param {ReauthDialogProps} props
 */
export function ReauthDialog({ open, twoFactorEnabled, onConfirmed, onCancelled }) {
  const { t } = useTranslation(NAMESPACE);
  const schema = useMemo(
    () =>
      z.object({
        password: passwordInputSchema,
        ...(twoFactorEnabled ? { otp: otpSchema } : {}),
      }),
    [twoFactorEnabled],
  );
  const form = useZodForm(schema, { defaultValues: { password: '', otp: '' } });

  /** @param {{ password: string, otp?: string }} values */
  const submit = async (values) => {
    await authApi.reauthenticate(twoFactorEnabled ? values : { password: values.password });
    form.reset();
    onConfirmed();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          onCancelled();
        }
      }}
      title={t('reauth.title')}
      description={t('reauth.intro')}
    >
      <Form form={form} onSubmit={submit} aria-label={t('reauth.title')} className="grid gap-5">
        <FormField name="password" label={t('fields.password')} required>
          {(field) => <PasswordInput {...field} autoComplete="current-password" />}
        </FormField>
        {twoFactorEnabled ? (
          <FormField name="otp" label={t('fields.otp')} hint={t('fields.otpHint')} required>
            {(field) => (
              <Input {...field} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            )}
          </FormField>
        ) : null}
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t('reauth.submit')}
        </Button>
      </Form>
    </Modal>
  );
}
