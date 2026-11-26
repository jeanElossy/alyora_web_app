import { describe, expect, it } from 'vitest';
import { createAuthEmails } from './auth-emails.js';

const emails = createAuthEmails({ webAppUrl: 'https://alyora-web.vercel.app' });
const to = {
  email: 'awa@exemple.ci',
  firstName: 'Awa',
  timezone: 'Africa/Abidjan',
  locale: 'fr',
};
const at = new Date('2026-11-19T15:00:00.000Z');

/** Chaque e-mail, rédigé pour le même destinataire. */
const everyEmail = (/** @type {typeof to} */ recipient) => ({
  verifyEmail: emails.verifyEmail(recipient, 'jeton-de-test'),
  accountExists: emails.accountExists(recipient),
  resetPassword: emails.resetPassword(recipient, 'jeton-de-test'),
  passwordChanged: emails.passwordChanged(recipient, at),
  passwordChangedElsewhere: emails.passwordChanged(recipient, at, { otherDevicesOnly: true }),
  accountLocked: emails.accountLocked(recipient, at),
  twoFactorEnabled: emails.twoFactorEnabled(recipient),
  twoFactorDisabled: emails.twoFactorDisabled(recipient),
  suspiciousSession: emails.suspiciousSession(recipient),
});

describe('auth e-mails', () => {
  it.each(Object.entries(everyEmail(to)))(
    '%s is fully written: no translation key or placeholder left',
    (_name, message) => {
      for (const part of [message.subject, message.text, message.html]) {
        expect(part).not.toMatch(/emails\.|\{\{|\}\}/);
        expect(part.length).toBeGreaterThan(10);
      }
      expect(message.to).toBe(to.email);
      expect(message.text.startsWith('Bonjour Awa,')).toBe(true);
      expect(message.text.endsWith('L’équipe ALYORA')).toBe(true);
    },
  );

  it('keeps the French wording, with the token in the link fragment', () => {
    const { verifyEmail, resetPassword } = everyEmail(to);

    expect(verifyEmail.subject).toBe('Confirmez votre adresse e-mail');
    expect(verifyEmail.text).toContain('Ce lien est valable 24 heures et ne sert qu’une fois.');
    expect(verifyEmail.text).toContain(
      'Confirmer mon adresse : https://alyora-web.vercel.app/verifier-email#jeton=jeton-de-test',
    );
    expect(resetPassword.text).toContain('Ce lien est valable 60 minutes');
  });

  it('writes the date in the time zone of the recipient', () => {
    const inAbidjan = emails.passwordChanged(to, at).text;
    const inParis = emails.passwordChanged({ ...to, timezone: 'Europe/Paris' }, at).text;

    expect(inAbidjan).toContain('19 novembre 2026');
    expect(inAbidjan).toContain('15:00');
    expect(inParis).toContain('16:00');
  });

  it('escapes the first name in HTML, and never reads it as a placeholder or a key', () => {
    const firstName = '<b>{{firstName}}</b> $t(emails.signature)';

    const message = emails.accountExists({ ...to, firstName });

    expect(message.text).toContain(`Bonjour ${firstName},`);
    expect(message.html).toContain(
      'Bonjour &lt;b&gt;{{firstName}}&lt;/b&gt; $t(emails.signature),',
    );
    expect(message.html).not.toContain('<b>');
  });

  it('falls back to French for an account without a known language', () => {
    for (const locale of [null, undefined, 'xx']) {
      expect(emails.accountExists({ ...to, locale }).subject).toBe(
        'Une inscription a été tentée avec votre adresse',
      );
    }
  });
});
