import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { Spinner } from '../../../components/ui/Spinner.jsx';
import { Table } from '../../../components/ui/Table.jsx';
import { isApiError } from '../../../lib/api/api-error.js';
import { NAMESPACE } from '../namespace.js';
import { DemoTitle, Section } from '../Section.jsx';
import { useApiPing } from '../use-api-ping.js';

/** Lignes de démonstration : réponse (ton du badge) et nombre de personnes. */
const ROWS = [
  { id: 'r1', tone: 'success', status: 'success', guests: 2 },
  { id: 'r2', tone: 'success', status: 'success', guests: 1 },
  { id: 'r3', tone: 'warning', status: 'warning', guests: 3 },
  { id: 'r4', tone: 'danger', status: 'danger', guests: 0 },
];

function ApiStatus() {
  const { t } = useTranslation(NAMESPACE);
  const ping = useApiPing();

  if (ping.isPending) {
    return <Spinner />;
  }
  if (ping.isError) {
    const code = isApiError(ping.error) ? ping.error.code : 'INTERNAL_ERROR';
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${code}`, { ns: 'common' })}
        </p>
        <Button variant="outline" size="sm" onClick={() => void ping.refetch()}>
          {t('api.retry')}
        </Button>
      </div>
    );
  }
  return <Badge tone="success">{t('api.ok')}</Badge>;
}

export function DataSection() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <Section
      id="data"
      title={t('sections.data.title')}
      description={t('sections.data.description')}
    >
      <div className="grid grid-cols-1 gap-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <DemoTitle>{t('card.title')}</DemoTitle>
            <Card
              title={t('card.heading')}
              description={t('card.description')}
              footer={<Button size="sm">{t('card.open')}</Button>}
            >
              <p className="text-sm text-charcoal">{t('card.body')}</p>
            </Card>
          </div>
          <div>
            <DemoTitle>{t('api.title')}</DemoTitle>
            <Card description={t('api.description')}>
              <ApiStatus />
            </Card>
          </div>
        </div>

        <div>
          <DemoTitle>{t('table.title')}</DemoTitle>
          <Table
            caption={t('table.caption')}
            columns={[
              { key: 'name', header: t('table.columns.name') },
              { key: 'table', header: t('table.columns.table') },
              { key: 'status', header: t('table.columns.status') },
              { key: 'guests', header: t('table.columns.guests'), align: 'right' },
            ]}
            rows={ROWS.map((row) => ({
              id: row.id,
              cells: {
                name: t(`table.rows.${row.id}.name`),
                table: t(`table.rows.${row.id}.table`),
                status: (
                  <Badge tone={/** @type {'success' | 'warning' | 'danger'} */ (row.tone)}>
                    {t(`badges.${row.status}`)}
                  </Badge>
                ),
                guests: row.guests,
              },
            }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <DemoTitle>{t('empty.title')}</DemoTitle>
            <EmptyState
              headingLevel="h3"
              title={t('empty.heading')}
              description={t('empty.description')}
              action={<Button size="sm">{t('empty.action')}</Button>}
            />
          </div>
          <div>
            <DemoTitle>{t('loading.title')}</DemoTitle>
            <Card>
              <Spinner label={t('loading.spinner')} />
              <div className="mt-6 flex items-center gap-4">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="mt-6 h-24 w-full rounded-2xl" />
            </Card>
          </div>
        </div>
      </div>
    </Section>
  );
}
