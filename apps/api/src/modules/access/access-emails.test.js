import { describe, expect, it } from 'vitest';
import { createAccessEmails } from './access-emails.js';

const emails = createAccessEmails({ webAppUrl: 'https://alyora-web.vercel.app' });
const EVENT_ID = '6b0790c7ff6f6a3544c1b7bb';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';

describe('access e-mails', () => {
  it('writes the invitation fully, the event and token in the link fragment', () => {
    const message = emails.invitation(
      { email: 'yao@exemple.ci', firstName: 'Yao', locale: 'fr' },
      { inviterName: 'Awa Koné', eventId: EVENT_ID, token: TOKEN },
    );

    for (const part of [message.subject, message.text, message.html]) {
      expect(part).not.toMatch(/emails\.|\{\{|\}\}/);
    }
    expect(message.to).toBe('yao@exemple.ci');
    expect(message.subject).toBe('Invitation à rejoindre l’équipe d’un mariage sur ALYORA');
    expect(message.text).toContain('Bonjour Yao,');
    expect(message.text).toContain('Awa Koné vous invite à rejoindre l’équipe');
    expect(message.text).toContain('valable 7 jours');
    expect(message.text).toContain(
      `https://alyora-web.vercel.app/invitation#evenement=${EVENT_ID}&jeton=${TOKEN}`,
    );
  });
});
