import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../components/ui/Checkbox.jsx';
import { Field } from '../../components/ui/Field.jsx';
import { RadioGroup } from '../../components/ui/Radio.jsx';
import { fieldErrorText } from './server-errors.js';

/**
 * @typedef {import('react-hook-form').ControllerRenderProps<any, string>
 *   & import('../../components/ui/Field.jsx').FieldControlProps} FormControlProps
 */

/**
 * @typedef {object} FormFieldProps
 * @property {string} name Chemin du champ dans le schéma.
 * @property {string} label
 * @property {string} [hint]
 * @property {boolean} [required]
 * @property {(control: FormControlProps) => import('react').ReactNode} children Le contrôle
 *   (Input, Textarea, Select), qui reçoit valeur, gestionnaires et attributs d'accessibilité.
 */

/**
 * Champ relié au formulaire : libellé, aide, et message d'erreur traduit sous le contrôle.
 * Comme les deux composants suivants, il se redessine quand la langue change, si bien qu'une
 * erreur venue de l'API suit la langue (voir fieldErrorText).
 *
 * @param {FormFieldProps} props
 */
export function FormField({ name, label, hint, required, children }) {
  const { control } = useFormContext();
  const { t } = useTranslation('ui');
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field
          label={label}
          hint={hint}
          required={required}
          error={fieldErrorText(fieldState.error, t)}
        >
          {(controlProps) => children({ ...field, ...controlProps })}
        </Field>
      )}
    />
  );
}

/**
 * Case à cocher reliée au formulaire (valeur booléenne).
 *
 * @param {{ name: string, label: string, description?: string }} props
 */
export function FormCheckbox({ name, label, description }) {
  const { control } = useFormContext();
  const { t } = useTranslation('ui');
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Checkbox
          ref={field.ref}
          name={field.name}
          label={label}
          description={description}
          checked={field.value === true}
          onCheckedChange={(checked) => field.onChange(checked === true)}
          onBlur={field.onBlur}
          error={fieldErrorText(fieldState.error, t)}
        />
      )}
    />
  );
}

/**
 * Groupe de boutons radio relié au formulaire.
 *
 * @param {{ name: string, legend: string, options: import('../../components/ui/Radio.jsx').RadioOption[] }} props
 */
export function FormRadioGroup({ name, legend, options }) {
  const { control } = useFormContext();
  const { t } = useTranslation('ui');
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <RadioGroup
          name={field.name}
          legend={legend}
          options={options}
          value={field.value ?? ''}
          onValueChange={field.onChange}
          error={fieldErrorText(fieldState.error, t)}
        />
      )}
    />
  );
}
