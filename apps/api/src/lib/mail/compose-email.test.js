import { describe, expect, it, vi } from 'vitest';
import { createTestLogger } from '../../../test/helpers/app.js';
import { createTranslator } from '../i18n/translator.js';
import { createEmailComposer, escapeHtml, sendSafely } from './compose-email.js';

const { t } = createTranslator({
  namespace: 'test',
  resources: {
    fr: {
      test: {
        emails: {
          greeting: 'Bonjour {{firstName}},',
          greetingAnonymous: 'Bonjour,',
          signature: 'L’équipe',
          hello: { subject: 'Sujet', line: 'De la part de {{name}}.', action: 'Ouvrir' },
        },
      },
    },
  },
});
const compose = createEmailComposer(t);

describe('email composer', () => {
  it('writes the text and an escaped HTML version, with a neutral greeting without first name', () => {
    const message = compose(
      { email: 'awa@exemple.ci', firstName: null },
      'hello',
      [['line', { name: '<script>Ali</script>' }]],
      'https://exemple.ci/?a=1&b="2"',
    );

    expect(message).toMatchObject({ to: 'awa@exemple.ci', subject: 'Sujet' });
    expect(message.text).toBe(
      'Bonjour,\n\nDe la part de <script>Ali</script>.\n\nOuvrir : https://exemple.ci/?a=1&b="2"\n\nL’équipe',
    );
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;Ali&lt;/script&gt;');
    expect(message.html).toContain('href="https://exemple.ci/?a=1&amp;b=&quot;2&quot;"');
    expect(compose({ email: 'a@b.ci', firstName: 'Awa' }, 'hello', [], 'x').text).toMatch(
      /^Bonjour Awa,/,
    );
  });

  it('escapes every HTML special character', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('never fails the operation when the e-mail cannot be queued', async () => {
    const { logger, logs } = createTestLogger();
    const mailer = { send: vi.fn(async () => Promise.reject(new Error('queue down'))) };

    await expect(
      sendSafely(
        { mailer, logger },
        { to: 'awa@exemple.ci', subject: 's', text: 't', html: 'h' },
        'test',
      ),
    ).resolves.toBeUndefined();

    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ level: 'error', event: 'test' }),
    );
    expect(logs.text()).not.toContain('awa@exemple.ci');
  });
});
