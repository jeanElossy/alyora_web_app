import { AUTH_WEB_PATHS, backupCodeSchema, loginRequestSchema, otpSchema } from '@alyora/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { queryKeys } from '../../../app/queryKeys.js';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { RETURN_PARAM } from '../../../lib/session/require-session.js';
import { authApi } from '../auth-api.js';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { NAMESPACE } from '../namespace.js';
import { safeReturnPath } from '../return-path.js';
import { useSpaceHandle } from '../space-handle.js';

const otpFormSchema = z.object({ code: otpSchema });
const backupFormSchema = z.object({ code: backupCodeSchema });

/**
 * Seconde étape : le code de l'application, ou un code de secours.
 *
 * @param {{ challengeToken: string, onSignedIn: () => void, onRestart: () => void }} props
 */
function TwoFactorStep({ challengeToken, onSignedIn, onRestart }) {
  const { t } = useTranslation(NAMESPACE);
  const [useBackup, setUseBackup] = useState(false);
  const form = useZodForm(useBackup ? backupFormSchema : otpFormSchema, {
    defaultValues: { code: '' },
  });

  /** @param {{ code: string }} values */
  const submit = async ({ code }) => {
    await authApi.verifyTwoFactor(
      useBackup ? { challengeToken, backupCode: code } : { challengeToken, otp: code },
    );
    onSignedIn();
  };

  return (
    <div className="grid gap-6">
      <p className="text-sm leading-relaxed text-muted">
        {useBackup ? t('twoFactorStep.backupIntro') : t('twoFactorStep.intro')}
      </p>
      <Form
        form={form}
        onSubmit={submit}
        aria-label={t('twoFactorStep.label')}
        className="grid gap-5"
      >
        <FormField
          name="code"
          label={useBackup ? t('fields.backupCode') : t('fields.otp')}
          hint={useBackup ? t('fields.backupCodeHint') : t('fields.otpHint')}
          required
        >
          {(field) => (
            <Input
              {...field}
              autoComplete="one-time-code"
              inputMode={useBackup ? 'text' : 'numeric'}
              autoCapitalize="characters"
              autoFocus
            />
          )}
        </FormField>
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          {t('twoFactorStep.submit')}
        </Button>
      </Form>
      <div className="flex flex-col gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setUseBackup((value) => !value);
            form.reset({ code: '' });
          }}
          className="w-fit text-forest underline-offset-4 hover:underline"
        >
          {useBackup ? t('twoFactorStep.useOtp') : t('twoFactorStep.useBackup')}
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="w-fit text-muted underline-offset-4 hover:text-forest hover:underline"
        >
          {t('twoFactorStep.restart')}
        </button>
      </div>
    </div>
  );
}

/**
 * Connexion à un espace (organisateur, accueil, administration) : e-mail et mot de passe,
 * puis le second facteur si la 2FA est active. Réussie, elle ramène à la page demandée
 * (`retour`), si elle est sûre, sinon à l'accueil de l'espace.
 */
export function LoginPage() {
  const { t } = useTranslation(NAMESPACE);
  const { space, home } = useSpaceHandle();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [challengeToken, setChallengeToken] = useState(/** @type {string | null} */ (null));
  const form = useZodForm(loginRequestSchema, { defaultValues: { email: '', password: '' } });

  const signedIn = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    void navigate(safeReturnPath(searchParams.get(RETURN_PARAM), home), { replace: true });
  };

  /** @param {import('@alyora/shared/schemas').LoginRequest} values */
  const submit = async (values) => {
    const result = await authApi.login(values);
    if (result.signedIn) {
      signedIn();
      return;
    }
    setChallengeToken(result.challengeToken);
  };

  return (
    <AuthLayout
      documentTitle={t('login.documentTitle', { space: t(`spaces.${space}`) })}
      eyebrow={t(`spaces.${space}`)}
      title={challengeToken ? t('twoFactorStep.title') : t(`login.titles.${space}`)}
      intro={challengeToken ? undefined : t('login.intro')}
      footer={
        <>
          <span>
            {t('login.noAccount')}{' '}
            <Link
              to="/inscription"
              className="font-medium text-forest underline-offset-4 hover:underline"
            >
              {t('login.register')}
            </Link>
          </span>
          <Link to="/" className="text-muted underline-offset-4 hover:text-forest hover:underline">
            {t('layout.backHome')}
          </Link>
        </>
      }
    >
      {challengeToken ? (
        <TwoFactorStep
          challengeToken={challengeToken}
          onSignedIn={signedIn}
          onRestart={() => {
            setChallengeToken(null);
            form.reset({ email: form.getValues('email'), password: '' });
          }}
        />
      ) : (
        <Form form={form} onSubmit={submit} aria-label={t('login.label')} className="grid gap-5">
          <FormField name="email" label={t('fields.email')} required>
            {(field) => <Input {...field} type="email" autoComplete="email" inputMode="email" />}
          </FormField>
          <FormField name="password" label={t('fields.password')} required>
            {(field) => <PasswordInput {...field} autoComplete="current-password" />}
          </FormField>
          <Link
            to={AUTH_WEB_PATHS.forgotPassword}
            className="-mt-2 w-fit text-sm text-forest underline-offset-4 hover:underline"
          >
            {t('login.forgot')}
          </Link>
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            {t('login.submit')}
          </Button>
        </Form>
      )}
    </AuthLayout>
  );
}
