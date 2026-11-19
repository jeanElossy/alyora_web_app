import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { MemoryRouter, Link } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.jsx';
import { Checkbox } from './Checkbox.jsx';
import { Field } from './Field.jsx';
import { Input } from './Input.jsx';
import { RadioGroup } from './Radio.jsx';
import { Select } from './Select.jsx';
import { Textarea } from './Textarea.jsx';

describe('Button', () => {
  it('is a button that never submits by mistake, and can be activated with the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Confirmer</Button>);

    const button = screen.getByRole('button', { name: 'Confirmer' });
    expect(button.getAttribute('type')).toBe('button');
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and announced busy while loading', () => {
    render(<Button loading>Envoyer</Button>);

    const button = screen.getByRole('button', { name: 'Envoyer' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('lends its style to a link with asChild', () => {
    render(
      <MemoryRouter>
        <Button asChild variant="outline">
          <Link to="/organisateur">Ouvrir</Link>
        </Button>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Ouvrir' });
    expect(link.getAttribute('href')).toBe('/organisateur');
    expect(link.className).toContain('rounded-full');
  });
});

describe('Field, Input and Textarea', () => {
  it('links the label, the hint and the error to the control, and marks it invalid', () => {
    render(
      <Field label="Adresse e-mail" hint="Pour vous répondre" error="Adresse invalide" required>
        {(control) => <Input {...control} type="email" />}
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: /Adresse e-mail/ });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const descriptions = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(descriptions).toEqual(['Pour vous répondre', 'Adresse invalide']);
    expect(screen.getByText(i18next.t('ui:field.required'))).toBeTruthy();
  });

  it('accepts text, on one line or several', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Field label="Nom">{(control) => <Input {...control} />}</Field>
        <Field label="Message">{(control) => <Textarea {...control} />}</Field>
      </>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Nom' }), 'Awa');
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Bonjour{Enter}à tous');

    expect(screen.getByRole('textbox', { name: 'Nom' })).toHaveProperty('value', 'Awa');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveProperty(
      'value',
      'Bonjour\nà tous',
    );
  });
});

describe('Checkbox', () => {
  it('toggles with the space bar and with its label', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label="Recevoir les rappels" onCheckedChange={onCheckedChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Recevoir les rappels' });
    await user.tab();
    await user.keyboard(' ');
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByText('Recevoir les rappels'));
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });
});

describe('RadioGroup', () => {
  it('is named by its legend, and moves the choice with the arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup
        legend="Serez-vous présent ?"
        defaultValue="yes"
        options={[
          { value: 'yes', label: 'Oui' },
          { value: 'no', label: 'Non' },
        ]}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Serez-vous présent ?' })).toBeTruthy();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Oui' }));
    // Touche maintenue, comme sous un doigt : Radix déplace le focus de façon différée, et ne
    // coche l'option que si la flèche est encore enfoncée à ce moment-là.
    await user.keyboard('{ArrowDown>}');
    await vi.waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Non' }).getAttribute('aria-checked')).toBe('true');
    });
    await user.keyboard('{/ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Non' }));
  });
});

describe('Select', () => {
  it('opens with the keyboard and selects an option', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Field label="Menu">
        {(control) => (
          <Select
            {...control}
            placeholder="Choisir un menu"
            onValueChange={onValueChange}
            options={[
              { value: 'classic', label: 'Menu traditionnel' },
              { value: 'fish', label: 'Poisson braisé' },
            ]}
          />
        )}
      </Field>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Menu' });
    expect(trigger.textContent).toContain('Choisir un menu');
    await user.tab();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: 'Poisson braisé' }));

    expect(onValueChange).toHaveBeenCalledWith('fish');
    expect(trigger.textContent).toContain('Poisson braisé');
  });
});
