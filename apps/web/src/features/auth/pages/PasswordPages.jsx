import {
  AUTH_WEB_PATHS,
  PASSWORD_MIN_LENGTH,
  emailRequestSchema,
  newPasswordSchema,
} from '@alyora/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { isApiError } from '../../../lib/api/api-error.js';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { authApi } from '../auth-api.js';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { clearEmailedToken, readEmailedToken } from '../emailed-token.js';
import { NAMESPACE } from '../namespace.js';

/** Lien vers la connexion de l'espace organisateur, sous les cartes. */
function LoginLink() {
  const { t } = useTranslation(NAMESPACE);
  return (
    <Link
      to="/organisateur/connexion"
      className="font-medium text-forest underline-offset-4 hover:underline"
    >
      {t('password.backToLogin')}
    </Link>
  );
}

/**
 * Mot de passe oublié. L'API répond toujours de la même façon : la page dit « si un compte
 * existe », jamais « ce compte existe ».
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation(NAMESPACE);
  const [sent, setSent] = useState(false);
  const form = useZodForm(emailRequestSchema, { defaultValues: { email: '' } });

  return (
    <AuthLayout
      documentTitle={t('forgot.documentTitle')}
      eyebrow={t('forgot.eyebrow')}
      title={sent ? t('forgot.sentTitle') : t('forgot.title')}
      intro={sent ? undefined : t('forgot.intro')}
      footer={<LoginLink />}
    >
      {sent ? (
        <p role="status" className="leading-relaxed text-charcoal">
          {t('forgot.sentText')}
        </p>
      ) : (
        <Form
          form={form}
          onSubmit={async ({ email }) => {
            await authApi.forgotPassword(email);
            setSent(true);
          }}
          aria-label={t('forgot.label')}
          className="grid gap-5"
        >
          <FormField name="email" label={t('fields.email')} required>
            {(field) => <Input {...field} type="email" autoComplete="email" inputMode="email" />}
          </FormField>
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            {t('forgot.submit')}
          </Button>
        </Form>
      )}
    </AuthLayout>
  );
}

const resetFormSchema = z.object({ password: newPasswordSchema });

/**
 * Nouveau mot de passe, depuis le lien de l'e-mail (`#jeton=...`, lu puis effacé de l'adresse).
 * Réussie, la réinitialisation déconnecte tous les appareils.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation(NAMESPACE);
  const [token] = useState(() => readEmailedToken());
  const [state, setState] = useState(
    /** @type {'form' | 'done' | 'invalid'} */ (token ? 'form' : 'invalid'),
  );
  const form = useZodForm(resetFormSchema, { defaultValues: { password: '' } });

  useEffect(() => {
    clearEmailedToken();
  }, []);

  /** @param {{ password: string }} values */
  const submit = async ({ password }) => {
    try {
      await authApi.resetPassword({ token: token ?? '', password });
      setState('done');
    } catch (error) {
      if (isApiError(error) && error.code === 'INVALID_TOKEN') {
        setState('invalid');
        return;
      }
      throw error;
    }
  };

  const titles = {
    form: t('reset.title'),
    done: t('reset.doneTitle'),
    invalid: t('reset.invalidTitle'),
  };

  return (
    <AuthLayout
      documentTitle={t('reset.documentTitle')}
      eyebrow={t('reset.eyebrow')}
      title={titles[state]}
      intro={state === 'form' ? t('reset.intro') : undefined}
      footer={<LoginLink />}
    >
      {state === 'form' ? (
        <Form form={form} onSubmit={submit} aria-label={t('reset.label')} className="grid gap-5">
          <FormField
            name="password"
            label={t('fields.newPassword')}
            hint={t('fields.newPasswordHint', { minimum: PASSWORD_MIN_LENGTH })}
            required
          >
            {(field) => <PasswordInput {...field} autoComplete="new-password" />}
          </FormField>
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            {t('reset.submit')}
          </Button>
        </Form>
      ) : null}
      {state === 'done' ? (
        <p role="status" className="leading-relaxed text-charcoal">
          {t('reset.doneText')}
        </p>
      ) : null}
      {state === 'invalid' ? (
        <div className="grid gap-6">
          <p role="alert" className="leading-relaxed text-muted">
            {t('reset.invalidText')}
          </p>
          <Button asChild variant="outline">
            <Link to={AUTH_WEB_PATHS.forgotPassword}>{t('reset.askAgain')}</Link>
          </Button>
        </div>
      ) : null}
    </AuthLayout>
  );
}
