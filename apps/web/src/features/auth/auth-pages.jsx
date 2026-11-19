// Bundle des pages du compte : connexion (de chaque espace), inscription, vérification de
// l'adresse, mot de passe oublié et réinitialisation, profil et sécurité. Chargé à la première
// visite de l'une d'elles, jamais avec l'accueil public.
import { registerNamespace } from '../../lib/i18n/i18n.js';
import fr from './locales/fr.json';
import { NAMESPACE } from './namespace.js';

registerNamespace(NAMESPACE, fr);

export { LoginPage } from './pages/LoginPage.jsx';
export { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages.jsx';
export { ProfilePage } from './pages/ProfilePage.jsx';
export { RegisterPage } from './pages/RegisterPage.jsx';
export { SecurityPage } from './pages/SecurityPage.jsx';
export { VerifyEmailPage } from './pages/VerifyEmailPage.jsx';
