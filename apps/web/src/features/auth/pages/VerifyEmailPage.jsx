import { emailRequestSchema } from '@alyora/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { queryKeys } from '../../../app/queryKeys.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { isApiError } from '../../../lib/api/api-error.js';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { authApi } from '../auth-api.js';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { clearEmailedToken, readEmailedToken } from '../emailed-token.js';
import { NAMESPACE } from '../namespace.js';

/** Demande d'un nouveau lien : toujours la même réponse, quelle que soit l'adresse. */
function ResendForm() {
  const { t } = useTranslation(NAMESPACE);
  const [sent, setSent] = useState(false);
  const form = useZodForm(emailRequestSchema, { defaultValues: { email: '' } });

  if (sent) {
    return (
      <p role="status" className="leading-relaxed text-charcoal">
        {t('verifyEmail.resent')}
      </p>
    );
  }
  return (
    <Form
      form={form}
      onSubmit={async ({ email }) => {
        await authApi.resendVerification(email);
        setSent(true);
      }}
      aria-label={t('verifyEmail.resendLabel')}
      className="grid gap-5"
    >
      <FormField name="email" label={t('fields.email')} required>
        {(field) => <Input {...field} type="email" autoComplete="email" inputMode="email" />}
      </FormField>
      <Button type="submit" variant="outline" loading={form.formState.isSubmitting}>
        {t('verifyEmail.resend')}
      </Button>
    </Form>
  );
}

/**
 * Page du lien de vérification (`/verifier-email#jeton=...`) : le jeton est lu puis effacé de
 * l'adresse, et envoyé une seule fois. Sans jeton, ou s'il n'est plus valable, la page propose
 * un nouveau lien.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation(NAMESPACE);
  const queryClient = useQueryClient();
  // Lecture pure, à l'affichage ; l'adresse est nettoyée ensuite, dans l'effet.
  const [token] = useState(() => readEmailedToken());
  const [state, setState] = useState(
    /** @type {'checking' | 'verified' | 'invalid' | 'missing' | 'failed'} */ (
      token ? 'checking' : 'missing'
    ),
  );
  const started = useRef(false);

  useEffect(() => {
    clearEmailedToken();
    // Une seule tentative, même quand React rejoue l'effet (mode strict).
    if (started.current || !token) {
      return;
    }
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(async () => {
        await authApi.refreshAfterVerification().catch(() => {});
        await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        setState('verified');
      })
      .catch((/** @type {unknown} */ error) => {
        setState(isApiError(error) && error.code === 'INVALID_TOKEN' ? 'invalid' : 'failed');
      });
  }, [queryClient, token]);

  const titles = {
    checking: t('verifyEmail.checkingTitle'),
    verified: t('verifyEmail.verifiedTitle'),
    invalid: t('verifyEmail.invalidTitle'),
    missing: t('verifyEmail.missingTitle'),
    failed: t('verifyEmail.failedTitle'),
  };

  return (
    <AuthLayout
      documentTitle={t('verifyEmail.documentTitle')}
      eyebrow={t('verifyEmail.eyebrow')}
      title={titles[state]}
    >
      {state === 'checking' ? (
        <div className="flex items-center gap-3 text-muted">
          <Spinner label={t('verifyEmail.checking')} />
          <span aria-hidden="true">{t('verifyEmail.checking')}</span>
        </div>
      ) : null}
      {state === 'verified' ? (
        <div className="grid gap-6">
          <p role="status" className="leading-relaxed text-charcoal">
            {t('verifyEmail.verifiedText')}
          </p>
          <Button asChild size="lg">
            <Link to="/organisateur">{t('verifyEmail.continue')}</Link>
          </Button>
        </div>
      ) : null}
      {state === 'invalid' || state === 'missing' || state === 'failed' ? (
        <div className="grid gap-6">
          <p
            role={state === 'missing' ? undefined : 'alert'}
            className="leading-relaxed text-muted"
          >
            {t(`verifyEmail.${state}Text`)}
          </p>
          <ResendForm />
        </div>
      ) : null}
    </AuthLayout>
  );
}
