import { designSystemDemoFormSchema } from '@alyora/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { Checkbox } from '../../../components/ui/Checkbox.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { toast } from '../../../components/ui/toast-store.js';
import { ApiError } from '../../../lib/api/api-error.js';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormCheckbox, FormField, FormRadioGroup } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { NAMESPACE } from '../namespace.js';
import { Section } from '../Section.jsx';

/** Durée simulée de l'envoi : le temps de voir le formulaire désactivé. */
const SIMULATED_LATENCY_MS = 900;

const DEFAULT_VALUES = {
  fullName: '',
  email: '',
  attendance: '',
  guests: '1',
  menu: '',
  message: '',
  consent: false,
};

/** Erreur que l'API renverrait pour une adresse refusée : rattachée au champ e-mail. */
function simulatedValidationError() {
  return new ApiError({
    code: 'VALIDATION_ERROR',
    status: 400,
    message: 'Invalid request body',
    details: { issues: [{ path: 'email', code: 'invalid_format', message: 'Invalid email' }] },
  });
}

export function FormSection() {
  const { t } = useTranslation(NAMESPACE);
  const [simulateError, setSimulateError] = useState(false);
  const form = useZodForm(designSystemDemoFormSchema, { defaultValues: DEFAULT_VALUES });

  async function submit() {
    await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS));
    if (simulateError) {
      throw simulatedValidationError();
    }
    toast({
      ns: NAMESPACE,
      title: 'form.success',
      description: 'form.successDescription',
      tone: 'success',
    });
    form.reset(DEFAULT_VALUES);
  }

  return (
    <Section
      id="form"
      title={t('sections.form.title')}
      description={t('sections.form.description')}
    >
      <Card>
        <Form
          form={form}
          onSubmit={submit}
          aria-label={t('form.label')}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2"
        >
          <FormField name="fullName" label={t('form.fullName')} required>
            {(field) => <Input {...field} autoComplete="name" />}
          </FormField>
          <FormField name="email" label={t('form.email')} required>
            {(field) => <Input {...field} type="email" autoComplete="email" />}
          </FormField>
          <div className="sm:col-span-2">
            <FormRadioGroup
              name="attendance"
              legend={t('form.attendance')}
              options={[
                { value: 'yes', label: t('options.attendance.yes') },
                { value: 'no', label: t('options.attendance.no') },
              ]}
            />
          </div>
          <FormField name="guests" label={t('form.guests')} hint={t('form.guestsHint')} required>
            {(field) => <Input {...field} type="number" inputMode="numeric" min={1} max={10} />}
          </FormField>
          <FormField name="menu" label={t('form.menu')} required>
            {({ value, onChange, onBlur, name, id, ...aria }) => (
              <Select
                {...aria}
                id={id}
                name={name}
                value={value}
                onValueChange={onChange}
                onBlur={onBlur}
                placeholder={t('form.menuPlaceholder')}
                options={[
                  { value: 'classic', label: t('options.menu.classic') },
                  { value: 'vegetarian', label: t('options.menu.vegetarian') },
                  { value: 'fish', label: t('options.menu.fish') },
                ]}
              />
            )}
          </FormField>
          <div className="sm:col-span-2">
            <FormField name="message" label={t('form.message')} hint={t('form.messageHint')}>
              {(field) => <Textarea {...field} />}
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormCheckbox name="consent" label={t('form.consent')} />
          </div>
          <div className="flex flex-col gap-5 border-t border-charcoal/10 pt-6 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <Checkbox
              label={t('form.simulateError')}
              description={t('form.simulateErrorHint')}
              checked={simulateError}
              onCheckedChange={(checked) => setSimulateError(checked === true)}
            />
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('form.submit')}
            </Button>
          </div>
        </Form>
      </Card>
    </Section>
  );
}
