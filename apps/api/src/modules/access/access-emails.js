import {
  ACCESS_WEB_PATHS,
  EMAILED_TOKEN_PARAM,
  INVITATION_EVENT_PARAM,
  INVITATION_TTL_SECONDS,
} from '@alyora/shared';
import { createTranslator } from '../../lib/i18n/translator.js';
import { createEmailComposer } from '../../lib/mail/compose-email.js';
import fr from './locales/fr.json' with { type: 'json' };

// E-mails du module des autorisations. Les textes viennent des traductions (locales/), dans la
// langue du destinataire ; la mise en forme est commune (lib/mail/compose-email.js).

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Rédaction des e-mails, liée à l'origine de l'application web.
 *
 * @param {{ webAppUrl: string }} options
 */
export function createAccessEmails({ webAppUrl }) {
  const { t } = createTranslator({ resources: { fr: { access: fr } }, namespace: 'access' });
  const compose = createEmailComposer(t);

  return {
    /**
     * Invitation à rejoindre l'équipe d'un événement. L'événement et le jeton sont dans le
     * fragment du lien : ils n'atteignent jamais un serveur, ni les logs, ni l'en-tête Referer.
     *
     * @param {import('../../lib/mail/compose-email.js').Recipient} to Adresse invitée ; son
     *   prénom si elle a déjà un compte.
     * @param {{ inviterName: string, eventId: string, token: string }} invitation
     */
    invitation: (to, { inviterName, eventId, token }) => {
      const fragment = new URLSearchParams({
        [INVITATION_EVENT_PARAM]: eventId,
        [EMAILED_TOKEN_PARAM]: token,
      });
      return compose(
        to,
        'invitation',
        [
          ['invited', { inviterName }],
          'account',
          ['validity', { count: INVITATION_TTL_SECONDS / DAY_SECONDS }],
          'notYou',
        ],
        `${webAppUrl}${ACCESS_WEB_PATHS.acceptInvitation}#${fragment}`,
      );
    },
  };
}

/** @typedef {ReturnType<typeof createAccessEmails>} AccessEmails */
