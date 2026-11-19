import {
  DEFAULT_TIMEZONE,
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
  timeZoneSchema,
} from '@alyora/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../../components/ui/Button.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { isApiError } from '../../../lib/api/api-error.js';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField, FormRadioGroup } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { authApi } from '../auth-api.js';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { NAMESPACE } from '../namespace.js';

/** Le fuseau du navigateur, s'il est connu de l'API ; sinon celui de la Côte d'Ivoire. */
function browserTimeZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZoneSchema.safeParse(zone).success ? zone : DEFAULT_TIMEZONE;
}

const newKey = () => crypto.randomUUID();

/**
 * Inscription. L'API répond toujours « demande acceptée », que l'adresse ait déjà un compte ou
 * non : la page dit donc seulement de vérifier sa boîte. La clé d'idempotence reste la même
 * pour les nouvelles tentatives d'un envoi qui n'a pas abouti (réseau), et change dès que
 * l'API a répondu.
 */
export function RegisterPage() {
  const { t } = useTranslation(NAMESPACE);
  const [sentTo, setSentTo] = useState(/** @type {string | null} */ (null));
  const idempotencyKey = useRef(newKey());
  const form = useZodForm(registerRequestSchema, {
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      accountType: 'individual',
      timezone: browserTimeZone(),
    },
  });

  /** @param {import('@alyora/shared/schemas').RegisterRequest} values */
  const submit = async (values) => {
    try {
      await authApi.register(values, idempotencyKey.current);
      setSentTo(values.email);
    } catch (error) {
      if (!isApiError(error) || error.status !== 0) {
        idempotencyKey.current = newKey();
      }
      throw error;
    }
  };

  const footer = (
    <span>
      {t('register.haveAccount')}{' '}
      <Link
        to="/organisateur/connexion"
        className="font-medium text-forest underline-offset-4 hover:underline"
      >
        {t('register.login')}
      </Link>
    </span>
  );

  if (sentTo) {
    return (
      <AuthLayout
        documentTitle={t('register.documentTitle')}
        eyebrow={t('register.eyebrow')}
        title={t('register.sentTitle')}
        footer={footer}
      >
        <div role="status" className="grid gap-4 leading-relaxed text-charcoal">
          <p>{t('register.sentText', { email: sentTo })}</p>
          <p className="text-sm text-muted">{t('register.sentHint')}</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      documentTitle={t('register.documentTitle')}
      eyebrow={t('register.eyebrow')}
      title={t('register.title')}
      intro={t('register.intro')}
      footer={footer}
    >
      <Form
        form={form}
        onSubmit={submit}
        aria-label={t('register.label')}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2"
      >
        <FormField name="firstName" label={t('fields.firstName')} required>
          {(field) => <Input {...field} autoComplete="given-name" />}
        </FormField>
        <FormField name="lastName" label={t('fields.lastName')} required>
          {(field) => <Input {...field} autoComplete="family-name" />}
        </FormField>
        <div className="sm:col-span-2">
          <FormField name="email" label={t('fields.email')} required>
            {(field) => <Input {...field} type="email" autoComplete="email" inputMode="email" />}
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField
            name="password"
            label={t('fields.password')}
            hint={t('fields.newPasswordHint', { minimum: PASSWORD_MIN_LENGTH })}
            required
          >
            {(field) => <PasswordInput {...field} autoComplete="new-password" />}
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormRadioGroup
            name="accountType"
            legend={t('fields.accountType')}
            options={[
              { value: 'individual', label: t('accountTypes.individual') },
              { value: 'professional', label: t('accountTypes.professional') },
            ]}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            {t('register.submit')}
          </Button>
        </div>
      </Form>
    </AuthLayout>
  );
}
