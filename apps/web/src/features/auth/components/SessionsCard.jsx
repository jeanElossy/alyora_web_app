import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { toast } from '../../../components/ui/toast-store.js';
import { authApi } from '../auth-api.js';
import { useAccountMutation, useAuthSessions } from '../auth-queries.js';
import { NAMESPACE } from '../namespace.js';

/**
 * Date et heure dans le fuseau du lecteur (règle du projet), en français.
 *
 * @param {string} iso
 */
const formatDate = (iso) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

/** Les appareils connectés au compte, la session courante signalée ; chacun se révoque. */
export function SessionsCard() {
  const { t } = useTranslation(NAMESPACE);
  const sessions = useAuthSessions();
  const revoke = useAccountMutation(authApi.revokeSession);
  const logoutAll = useAccountMutation(authApi.logoutAll);

  return (
    <Card
      title={t('security.sessions.title')}
      description={t('security.sessions.intro')}
      footer={
        <Button
          variant="outline"
          size="sm"
          loading={logoutAll.isPending}
          onClick={() => logoutAll.mutate(undefined)}
        >
          {t('security.sessions.logoutAll')}
        </Button>
      }
    >
      {sessions.data ? (
        <ul className="divide-y divide-charcoal/10">
          {sessions.data.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium text-charcoal">
                  {session.deviceLabel === 'Unknown · Unknown'
                    ? t('security.sessions.unknownDevice')
                    : session.deviceLabel}
                  {session.current ? (
                    <Badge tone="success">{t('security.sessions.current')}</Badge>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t('security.sessions.lastSeen', { date: formatDate(session.lastSeenAt) })}
                </p>
              </div>
              {session.current ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={revoke.isPending && revoke.variables === session.id}
                  onClick={() =>
                    revoke.mutate(session.id, {
                      onSuccess: () =>
                        toast({
                          ns: NAMESPACE,
                          title: 'security.sessions.revoked',
                          tone: 'success',
                        }),
                    })
                  }
                >
                  {t('security.sessions.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div aria-busy="true" className="grid gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      )}
    </Card>
  );
}
