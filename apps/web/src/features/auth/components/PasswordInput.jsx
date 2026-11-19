import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../../../components/ui/Input.jsx';
import { NAMESPACE } from '../namespace.js';

/**
 * Champ de mot de passe, avec un bouton qui l'affiche ou le masque (plutôt qu'un champ de
 * confirmation). Le bouton annonce son état (aria-pressed) et ne soumet jamais le formulaire.
 *
 * @param {import('react').ComponentPropsWithRef<'input'>} props Reçues de FormField.
 */
export function PasswordInput(props) {
  const { t } = useTranslation(NAMESPACE);
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-28" />
      <button
        type="button"
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-1.5 right-1.5 rounded-lg px-3 text-sm font-medium text-forest transition-colors hover:bg-ivory"
      >
        {visible ? t('password.hide') : t('password.show')}
      </button>
    </div>
  );
}
