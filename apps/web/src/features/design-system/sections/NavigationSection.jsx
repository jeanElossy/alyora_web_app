import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '../../../components/ui/Pagination.jsx';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import { NAMESPACE } from '../namespace.js';
import { DemoTitle, Section } from '../Section.jsx';

const PAGE_SIZE = 20;
const TOTAL_GUESTS = 312;
const LAST_PAGE = Math.ceil(TOTAL_GUESTS / PAGE_SIZE) - 1;

export function NavigationSection() {
  const { t } = useTranslation(NAMESPACE);
  const [page, setPage] = useState(0);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, TOTAL_GUESTS);

  return (
    <Section
      id="navigation"
      title={t('sections.navigation.title')}
      description={t('sections.navigation.description')}
    >
      <div className="grid grid-cols-1 gap-12">
        <div>
          <DemoTitle>{t('tabs.title')}</DemoTitle>
          <Tabs
            label={t('tabs.label')}
            items={[
              {
                value: 'guests',
                label: t('tabs.guests'),
                content: <p>{t('tabs.guestsContent')}</p>,
              },
              {
                value: 'seating',
                label: t('tabs.seating'),
                content: <p>{t('tabs.seatingContent')}</p>,
              },
              {
                value: 'program',
                label: t('tabs.program'),
                content: <p>{t('tabs.programContent')}</p>,
              },
            ]}
          />
        </div>
        <div>
          <DemoTitle>{t('pagination.title')}</DemoTitle>
          <Pagination
            hasPrevious={page > 0}
            hasNext={page < LAST_PAGE}
            onPrevious={() => setPage((current) => Math.max(0, current - 1))}
            onNext={() => setPage((current) => Math.min(LAST_PAGE, current + 1))}
            summary={t('pagination.summary', { from, to, total: TOTAL_GUESTS })}
          />
        </div>
      </div>
    </Section>
  );
}
