import { PASSWORD_MIN_LENGTH, newPasswordSchema } from '@alyora/shared';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { CONTAINER } from '../../../app/SpaceShell.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { toast } from '../../../components/ui/toast-store.js';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { authApi } from '../auth-api.js';
import { useAccountMutation, useCurrentUser } from '../auth-queries.js';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { ReauthDialog } from '../components/ReauthDialog.jsx';
import { SessionsCard } from '../components/SessionsCard.jsx';
import { TwoFactorCard } from '../components/TwoFactorCard.jsx';
import { NAMESPACE } from '../namespace.js';
import { useSensitiveAction } from '../use-sensitive-action.js';
import { AccountHeader } from './AccountHeader.jsx';

const passwordFormSchema = z.object({ newPassword: newPasswordSchema });

/**
 * @param {{ runSensitive: <T>(operation: () => Promise<T>) => Promise<T> }} props
 */
function ChangePasswordCard({ runSensitive }) {
  const { t } = useTranslation(NAMESPACE);
  const change = useAccountMutation(authApi.changePassword);
  const form = useZodForm(passwordFormSchema, { defaultValues: { newPassword: '' } });

  return (
    <Card title={t('security.password.title')} description={t('security.password.intro')}>
      <Form
        form={form}
        onSubmit={async ({ newPassword }) => {
          await runSensitive(() => change.mutateAsync(newPassword));
          form.reset();
          toast({ ns: NAMESPACE, title: 'security.password.changed', tone: 'success' });
        }}
        aria-label={t('security.password.title')}
        className="grid gap-5"
      >
        <FormField
          name="newPassword"
          label={t('fields.newPassword')}
          hint={t('fields.newPasswordHint', { minimum: PASSWORD_MIN_LENGTH })}
          required
        >
          {(field) => <PasswordInput {...field} autoComplete="new-password" />}
        </FormField>
        <Button type="submit" className="w-fit" loading={form.formState.isSubmitting}>
          {t('security.password.submit')}
        </Button>
      </Form>
    </Card>
  );
}

/**
 * Sécurité du compte : appareils connectés, double authentification, mot de passe. Les
 * opérations sensibles demandent de confirmer son mot de passe si la dernière connexion date
 * de plus de 10 minutes.
 */
export function SecurityPage() {
  const { t } = useTranslation(NAMESPACE);
  const me = useCurrentUser();
  const sensitive = useSensitiveAction();
  const twoFactorEnabled = me.data?.twoFactorEnabled ?? false;

  return (
    <div className={`${CONTAINER} py-12 sm:py-16`}>
      <title>{t('security.documentTitle')}</title>
      <AccountHeader title={t('security.title')} intro={t('security.intro')} />
      <div className="mt-10 grid animate-rise gap-8 [animation-delay:120ms] lg:grid-cols-2">
        <div className="lg:col-span-2">
          <SessionsCard />
        </div>
        <TwoFactorCard enabled={twoFactorEnabled} runSensitive={sensitive.run} />
        <ChangePasswordCard runSensitive={sensitive.run} />
      </div>
      <ReauthDialog
        open={sensitive.reauthOpen}
        twoFactorEnabled={twoFactorEnabled}
        onConfirmed={sensitive.onReauthenticated}
        onCancelled={sensitive.onReauthCancelled}
      />
    </div>
  );
}
