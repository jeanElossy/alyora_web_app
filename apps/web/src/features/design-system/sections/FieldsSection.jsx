import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../../components/ui/Checkbox.jsx';
import { Field } from '../../../components/ui/Field.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { RadioGroup } from '../../../components/ui/Radio.jsx';
import { Select } from '../../../components/ui/Select.jsx';
import { Textarea } from '../../../components/ui/Textarea.jsx';
import { NAMESPACE } from '../namespace.js';
import { DemoTitle, Section } from '../Section.jsx';

export function FieldsSection() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <Section
      id="fields"
      title={t('sections.fields.title')}
      description={t('sections.fields.description')}
    >
      <DemoTitle>{t('fields.title')}</DemoTitle>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label={t('fields.name.label')} hint={t('fields.name.hint')} required>
          {(control) => (
            <Input {...control} autoComplete="name" placeholder={t('fields.name.placeholder')} />
          )}
        </Field>
        <Field label={t('fields.email.label')} error={t('fields.email.error')}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="email"
              defaultValue={t('fields.email.value')}
            />
          )}
        </Field>
        <Field label={t('fields.menu.label')}>
          {(control) => (
            <Select
              {...control}
              placeholder={t('fields.menu.placeholder')}
              options={[
                { value: 'classic', label: t('options.menu.classic') },
                { value: 'vegetarian', label: t('options.menu.vegetarian') },
                { value: 'fish', label: t('options.menu.fish'), disabled: true },
              ]}
            />
          )}
        </Field>
        <Field label={t('fields.disabled.label')}>
          {(control) => <Input {...control} disabled defaultValue={t('fields.disabled.value')} />}
        </Field>
        <Field label={t('fields.message.label')} className="sm:col-span-2">
          {(control) => <Textarea {...control} placeholder={t('fields.message.placeholder')} />}
        </Field>
      </div>

      <div className="mt-12">
        <DemoTitle>{t('fields.choices')}</DemoTitle>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Checkbox
              label={t('fields.consent.label')}
              description={t('fields.consent.description')}
            />
            <Checkbox label={t('fields.consentChecked.label')} defaultChecked />
            <Checkbox label={t('fields.consentDisabled.label')} disabled />
          </div>
          <RadioGroup
            legend={t('fields.attendance.legend')}
            defaultValue="yes"
            options={[
              { value: 'yes', label: t('options.attendance.yes') },
              { value: 'no', label: t('options.attendance.no') },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}
