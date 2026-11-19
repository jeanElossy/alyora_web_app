import { accountTypeSchema, personNameSchema, phoneSchema, timeZoneSchema } from '@alyora/shared';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { CONTAINER } from '../../../app/SpaceShell.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { toast } from '../../../components/ui/toast-store.js';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField, FormRadioGroup } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { authApi } from '../auth-api.js';
import { useAccountMutation, useCurrentUser } from '../auth-queries.js';
import { NAMESPACE } from '../namespace.js';
import { AccountHeader } from './AccountHeader.jsx';

/** Fuseaux proposés : ceux des mariages en Côte d'Ivoire et de leurs invités de l'étranger. */
const TIME_ZONES = [
  'Africa/Abidjan',
  'Africa/Dakar',
  'Africa/Accra',
  'Africa/Lagos',
  'Africa/Casablanca',
  'Europe/Paris',
  'Europe/London',
  'America/Montreal',
  'America/New_York',
];

/** Les champs du schéma partagé ; le téléphone peut être laissé vide (retiré). */
const profileFormSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: z.union([phoneSchema, z.literal('')]),
  accountType: accountTypeSchema,
  timezone: timeZoneSchema,
});

/** @param {{ user: import('@alyora/shared/schemas').CurrentUser }} props */
function ProfileForm({ user }) {
  const { t } = useTranslation(NAMESPACE);
  const update = useAccountMutation(authApi.updateMe);
  const form = useZodForm(profileFormSchema, {
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? '',
      accountType: user.accountType,
      timezone: user.timezone,
    },
  });
  const zones = TIME_ZONES.includes(user.timezone) ? TIME_ZONES : [user.timezone, ...TIME_ZONES];

  /** @param {z.infer<typeof profileFormSchema>} values */
  const submit = async (values) => {
    await update.mutateAsync({ ...values, phone: values.phone === '' ? null : values.phone });
    form.reset(values);
    toast({ ns: NAMESPACE, title: 'profile.saved', tone: 'success' });
  };

  return (
    <Form
      form={form}
      onSubmit={submit}
      aria-label={t('profile.label')}
      className="grid grid-cols-1 gap-6 sm:grid-cols-2"
    >
      <FormField name="firstName" label={t('fields.firstName')} required>
        {(field) => <Input {...field} autoComplete="given-name" />}
      </FormField>
      <FormField name="lastName" label={t('fields.lastName')} required>
        {(field) => <Input {...field} autoComplete="family-name" />}
      </FormField>
      <FormField name="phone" label={t('fields.phone')} hint={t('fields.phoneHint')}>
        {(field) => <Input {...field} type="tel" autoComplete="tel" inputMode="tel" />}
      </FormField>
      <FormField name="timezone" label={t('fields.timezone')} required>
        {({ value, onChange, onBlur, name, id, ...aria }) => (
          <Select
            {...aria}
            id={id}
            name={name}
            value={value}
            onValueChange={onChange}
            onBlur={onBlur}
            placeholder={t('fields.timezone')}
            options={zones.map((zone) => ({ value: zone, label: zone.replace('_', ' ') }))}
          />
        )}
      </FormField>
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
      <div className="flex justify-end sm:col-span-2">
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!form.formState.isDirty}
        >
          {t('profile.save')}
        </Button>
      </div>
    </Form>
  );
}

/** Mon compte : identité, coordonnées, type de compte et fuseau. L'adresse e-mail est affichée. */
export function ProfilePage() {
  const { t } = useTranslation(NAMESPACE);
  const me = useCurrentUser();

  return (
    <div className={`${CONTAINER} py-12 sm:py-16`}>
      <title>{t('profile.documentTitle')}</title>
      <AccountHeader title={t('profile.title')} intro={t('profile.intro')} />
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          {me.data ? (
            <ProfileForm user={me.data} />
          ) : (
            <div aria-busy="true" className="grid gap-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-2/3" />
            </div>
          )}
        </Card>
        <Card title={t('profile.emailTitle')} description={t('profile.emailText')}>
          {me.data ? (
            <div className="grid gap-3">
              <p className="font-medium break-all text-charcoal">{me.data.email}</p>
              <Badge tone={me.data.emailVerified ? 'success' : 'warning'}>
                {me.data.emailVerified ? t('profile.emailVerified') : t('profile.emailPending')}
              </Badge>
            </div>
          ) : (
            <Skeleton className="h-6 w-full" />
          )}
        </Card>
      </div>
    </div>
  );
}
