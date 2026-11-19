import { designSystemDemoFormSchema } from '@alyora/shared';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Select } from '../../components/ui/Select.jsx';
import { ApiError } from '../api/api-error.js';
import { DEFAULT_LANGUAGE, KEYS_LANGUAGE } from '../i18n/i18n.js';
import { Form } from './Form.jsx';
import { FormCheckbox, FormField, FormRadioGroup } from './FormField.jsx';
import { useZodForm } from './use-zod-form.js';
import { describeIssue } from './zod-messages.js';

/** @param {string} key @param {Record<string, unknown>} [values] */
const t = (key, values = {}) => i18next.t(key, values);

/** @param {{ onSubmit: (values: any) => Promise<void> | void }} props */
function DemoForm({ onSubmit }) {
  const form = useZodForm(designSystemDemoFormSchema, {
    defaultValues: {
      fullName: '',
      email: '',
      attendance: '',
      guests: '1',
      menu: '',
      consent: false,
    },
  });
  return (
    <Form form={form} onSubmit={onSubmit} aria-label="Réponse">
      <FormField name="fullName" label="Nom complet" required>
        {(field) => <Input {...field} />}
      </FormField>
      <FormField name="email" label="Adresse e-mail" required>
        {(field) => <Input {...field} type="email" />}
      </FormField>
      <FormRadioGroup
        name="attendance"
        legend="Serez-vous présent ?"
        options={[
          { value: 'yes', label: 'Oui' },
          { value: 'no', label: 'Non' },
        ]}
      />
      <FormField name="guests" label="Personnes" required>
        {(field) => <Input {...field} type="number" />}
      </FormField>
      <FormField name="menu" label="Menu" required>
        {({ value, onChange, onBlur, name, id, ...aria }) => (
          <Select
            {...aria}
            id={id}
            name={name}
            value={value}
            onValueChange={onChange}
            onBlur={onBlur}
            placeholder="Choisir"
            options={[
              { value: 'classic', label: 'Menu traditionnel' },
              { value: 'fish', label: 'Poisson braisé' },
            ]}
          />
        )}
      </FormField>
      <FormCheckbox name="consent" label="J'accepte" />
      <Button type="submit">Envoyer</Button>
    </Form>
  );
}

/** @param {ReturnType<typeof userEvent.setup>} user */
async function fillValidAnswer(user) {
  await user.type(screen.getByRole('textbox', { name: /Nom complet/ }), 'Awa Koné');
  await user.type(screen.getByRole('textbox', { name: /Adresse e-mail/ }), 'awa@exemple.ci');
  await user.click(screen.getByRole('radio', { name: 'Oui' }));
  const guests = screen.getByRole('spinbutton', { name: /Personnes/ });
  await user.clear(guests);
  await user.type(guests, '2');
  await user.click(screen.getByRole('combobox', { name: /Menu/ }));
  await user.click(await screen.findByRole('option', { name: 'Poisson braisé' }));
  await user.click(screen.getByRole('checkbox', { name: "J'accepte" }));
}

/** @param {HTMLElement} control */
function errorOf(control) {
  const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent).join(' ');
}

afterEach(async () => {
  await i18next.changeLanguage(DEFAULT_LANGUAGE);
});

describe('forms on a shared Zod schema', () => {
  it('shows a translated error under each invalid field, and does not submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DemoForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    const name = screen.getByRole('textbox', { name: /Nom complet/ });
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(errorOf(name)).toBe(t('ui:form.errors.required'));
    expect(errorOf(screen.getByRole('checkbox', { name: "J'accepte" }))).toBe(
      t('ui:form.errors.must_accept'),
    );
    expect(screen.getByRole('radiogroup').getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains a too short value and an invalid e-mail address', async () => {
    const user = userEvent.setup();
    render(<DemoForm onSubmit={() => {}} />);

    await user.type(screen.getByRole('textbox', { name: /Nom complet/ }), 'A');
    await user.type(screen.getByRole('textbox', { name: /Adresse e-mail/ }), 'awa@');
    await user.tab();

    expect(errorOf(screen.getByRole('textbox', { name: /Nom complet/ }))).toBe(
      t('ui:form.errors.too_small_string', { minimum: 2 }),
    );
    expect(errorOf(screen.getByRole('textbox', { name: /Adresse e-mail/ }))).toBe(
      t('ui:form.errors.invalid_email'),
    );
  });

  it('submits the parsed values, with every control disabled while sending', async () => {
    const user = userEvent.setup();
    /** @type {(value?: unknown) => void} */
    let finish = () => {};
    const onSubmit = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    render(<DemoForm onSubmit={onSubmit} />);

    await fillValidAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Awa Koné', guests: 2, menu: 'fish', consent: true }),
    );
    const form = screen.getByRole('form', { name: 'Réponse' });
    expect(within(form).getByRole('group').hasAttribute('disabled')).toBe(true);
    // Désactivé par le fieldset : la propriété disabled du bouton reste false, :disabled s'applique.
    expect(screen.getByRole('button', { name: 'Envoyer' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: /Nom complet/ }).matches(':disabled')).toBe(true);

    await act(async () => finish());
    expect(within(form).getByRole('group').hasAttribute('disabled')).toBe(false);
  });

  it('places the validation errors of the API under their fields, and says what failed', async () => {
    const user = userEvent.setup();
    render(
      <DemoForm
        onSubmit={async () => {
          throw new ApiError({
            code: 'VALIDATION_ERROR',
            status: 400,
            message: 'Invalid request body',
            details: { issues: [{ path: 'email', code: 'invalid_format', message: 'Invalid' }] },
          });
        }}
      />,
    );

    await fillValidAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    const email = screen.getByRole('textbox', { name: /Adresse e-mail/ });
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      `${t('ui:form.submitFailed')}${t('common:errors.VALIDATION_ERROR')}`,
    );
    expect(errorOf(email)).toBe(t('ui:form.errors.invalid_format'));
    await vi.waitFor(() => expect(document.activeElement).toBe(email));
  });

  it('shows the generic message for an unexpected failure, never its details', async () => {
    const user = userEvent.setup();
    render(
      <DemoForm
        onSubmit={async () => {
          throw new TypeError('Cannot read properties of undefined at form.js:12');
        }}
      />,
    );

    await fillValidAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t('common:errors.INTERNAL_ERROR'));
    expect(alert.textContent).not.toMatch(/Cannot read|form\.js/);
  });

  it('translates the displayed errors again when the language changes', async () => {
    const user = userEvent.setup();
    render(<DemoForm onSubmit={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    const name = screen.getByRole('textbox', { name: /Nom complet/ });

    await act(async () => {
      await i18next.changeLanguage(KEYS_LANGUAGE);
    });

    await vi.waitFor(() => expect(errorOf(name)).toBe('form.errors.required'));
  });

  it('translates the errors of the API again when the language changes', async () => {
    const user = userEvent.setup();
    render(
      <DemoForm
        onSubmit={async () => {
          throw new ApiError({
            code: 'VALIDATION_ERROR',
            status: 400,
            message: 'Invalid request body',
            details: { issues: [{ path: 'email', code: 'invalid_format', message: 'Invalid' }] },
          });
        }}
      />,
    );
    await fillValidAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    const alert = await screen.findByRole('alert');

    await act(async () => {
      await i18next.changeLanguage(KEYS_LANGUAGE);
    });

    expect(alert.textContent).toBe('form.submitFailederrors.VALIDATION_ERROR');
    expect(errorOf(screen.getByRole('textbox', { name: /Adresse e-mail/ }))).toBe(
      'form.errors.invalid_format',
    );
  });

  it('translates the generic message again when the language changes', async () => {
    const user = userEvent.setup();
    render(
      <DemoForm
        onSubmit={async () => {
          throw new TypeError('Cannot read properties of undefined');
        }}
      />,
    );
    await fillValidAnswer(user);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    const alert = await screen.findByRole('alert');

    await act(async () => {
      await i18next.changeLanguage(KEYS_LANGUAGE);
    });

    expect(alert.textContent).toBe('form.submitFailederrors.INTERNAL_ERROR');
  });
});

describe('describeIssue', () => {
  it.each([
    [{ code: 'invalid_type', input: undefined }, 'required'],
    [{ code: 'too_small', input: '', origin: 'string', minimum: 2 }, 'required'],
    [{ code: 'too_small', input: 'A', origin: 'string', minimum: 2 }, 'too_small_string'],
    [{ code: 'too_big', input: 11, origin: 'number', maximum: 10 }, 'too_big_number'],
    [{ code: 'invalid_type', input: 1.5, expected: 'int' }, 'not_integer'],
    [{ code: 'invalid_format', input: 'awa@', format: 'email' }, 'invalid_email'],
    [{ code: 'invalid_value', input: false, values: [true] }, 'must_accept'],
    [{ code: 'invalid_value', input: '', values: ['yes', 'no'] }, 'invalid_value'],
    [{ code: 'custom', input: 'x' }, 'invalid'],
  ])('maps %o to %s', (issue, key) => {
    expect(describeIssue(issue).key).toBe(key);
  });
});
