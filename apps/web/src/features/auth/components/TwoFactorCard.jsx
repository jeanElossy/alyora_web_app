import { backupCodeSchema, otpSchema } from '@alyora/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { toast } from '../../../components/ui/toast-store.js';
import { Form } from '../../../lib/forms/Form.jsx';
import { FormField } from '../../../lib/forms/FormField.jsx';
import { useZodForm } from '../../../lib/forms/use-zod-form.js';
import { authApi } from '../auth-api.js';
import { useAccountMutation } from '../auth-queries.js';
import { NAMESPACE } from '../namespace.js';

const otpFormSchema = z.object({ code: otpSchema });
const anyCodeSchema = z.object({ code: z.union([otpSchema, backupCodeSchema]) });

/**
 * @typedef {object} TwoFactorCardProps
 * @property {boolean} enabled
 * @property {<T>(operation: () => Promise<T>) => Promise<T>} runSensitive Exécute une opération
 *   sensible (réauthentification si besoin, voir useSensitiveAction).
 */

/**
 * Double authentification : réglage (QR code généré par l'API, secret pour une saisie à la
 * main), activation par un premier code, codes de secours montrés une seule fois, désactivation.
 *
 * @param {TwoFactorCardProps} props
 */
export function TwoFactorCard({ enabled, runSensitive }) {
  const { t } = useTranslation(NAMESPACE);
  const [setup, setSetup] = useState(
    /** @type {{ secret: string, qrCodeDataUrl: string } | null} */ (null),
  );
  const [backupCodes, setBackupCodes] = useState(/** @type {string[] | null} */ (null));
  const [disabling, setDisabling] = useState(false);
  const enable = useAccountMutation(authApi.twoFactorEnable);
  const disable = useAccountMutation(authApi.twoFactorDisable);
  const enableForm = useZodForm(otpFormSchema, { defaultValues: { code: '' } });
  const disableForm = useZodForm(anyCodeSchema, { defaultValues: { code: '' } });

  const start = async () => {
    setSetup(await runSensitive(() => authApi.twoFactorSetup()));
  };

  return (
    <Card title={t('security.twoFactor.title')} description={t('security.twoFactor.intro')}>
      <div className="grid gap-6">
        <Badge tone={enabled ? 'success' : 'neutral'} className="w-fit">
          {enabled ? t('security.twoFactor.on') : t('security.twoFactor.off')}
        </Badge>

        {backupCodes ? (
          <div
            className="grid gap-4 rounded-2xl border border-champagne bg-ivory p-5"
            role="status"
          >
            <p className="font-medium text-forest">{t('security.twoFactor.codesTitle')}</p>
            <p className="text-sm leading-relaxed text-muted">
              {t('security.twoFactor.codesText')}
            </p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-charcoal">
              {backupCodes.map((code) => (
                <li key={code} className="rounded-lg bg-white px-3 py-2 text-center tabular-nums">
                  {code}
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setBackupCodes(null)}
            >
              {t('security.twoFactor.codesDone')}
            </Button>
          </div>
        ) : null}

        {!enabled && !setup && !backupCodes ? (
          <Button className="w-fit" onClick={() => void start().catch(() => {})}>
            {t('security.twoFactor.start')}
          </Button>
        ) : null}

        {!enabled && setup ? (
          <div className="grid gap-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start">
            <img
              src={setup.qrCodeDataUrl}
              alt={t('security.twoFactor.qrAlt')}
              width={176}
              height={176}
              className="h-44 w-44 rounded-2xl border border-charcoal/10 bg-white p-2"
            />
            <div className="grid gap-4">
              <p className="text-sm leading-relaxed text-muted">{t('security.twoFactor.scan')}</p>
              <p className="text-sm text-muted">
                {t('security.twoFactor.manual')}{' '}
                <code className="font-mono break-all text-charcoal">{setup.secret}</code>
              </p>
              <Form
                form={enableForm}
                onSubmit={async ({ code }) => {
                  const codes = await runSensitive(() => enable.mutateAsync(code));
                  setSetup(null);
                  setBackupCodes(codes);
                  enableForm.reset();
                  toast({ ns: NAMESPACE, title: 'security.twoFactor.enabled', tone: 'success' });
                }}
                aria-label={t('security.twoFactor.enableLabel')}
                className="grid gap-4"
              >
                <FormField name="code" label={t('fields.otp')} hint={t('fields.otpHint')} required>
                  {(field) => (
                    <Input
                      {...field}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                  )}
                </FormField>
                <Button type="submit" className="w-fit" loading={enableForm.formState.isSubmitting}>
                  {t('security.twoFactor.enable')}
                </Button>
              </Form>
            </div>
          </div>
        ) : null}

        {enabled && !disabling ? (
          <Button variant="outline" className="w-fit" onClick={() => setDisabling(true)}>
            {t('security.twoFactor.disable')}
          </Button>
        ) : null}

        {enabled && disabling ? (
          <Form
            form={disableForm}
            onSubmit={async ({ code }) => {
              const factor = /^\d{6}$/.test(code) ? { otp: code } : { backupCode: code };
              await runSensitive(() => disable.mutateAsync(factor));
              setDisabling(false);
              disableForm.reset();
              toast({ ns: NAMESPACE, title: 'security.twoFactor.disabled', tone: 'success' });
            }}
            aria-label={t('security.twoFactor.disableLabel')}
            className="grid gap-4"
          >
            <FormField
              name="code"
              label={t('security.twoFactor.disableCode')}
              hint={t('security.twoFactor.disableHint')}
              required
            >
              {(field) => <Input {...field} autoComplete="one-time-code" />}
            </FormField>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="danger" loading={disableForm.formState.isSubmitting}>
                {t('security.twoFactor.confirmDisable')}
              </Button>
              <Button variant="ghost" onClick={() => setDisabling(false)}>
                {t('security.twoFactor.cancel')}
              </Button>
            </div>
          </Form>
        ) : null}
      </div>
    </Card>
  );
}
