import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, initialsOf } from './Avatar.jsx';
import { Badge } from './Badge.jsx';
import { Card } from './Card.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Pagination } from './Pagination.jsx';
import { Skeleton } from './Skeleton.jsx';
import { Spinner } from './Spinner.jsx';
import { Table } from './Table.jsx';
import { Tabs } from './Tabs.jsx';

describe('Tabs', () => {
  it('names its list, and moves to the next tab with the arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        label="Organisation"
        items={[
          { value: 'guests', label: 'Invités', content: <p>Liste des invités</p> },
          { value: 'seating', label: 'Plan de table', content: <p>Disposition des tables</p> },
        ]}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Organisation' })).toBeTruthy();
    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Plan de table' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tabpanel').textContent).toBe('Disposition des tables');
  });
});

describe('Pagination', () => {
  it('is a named navigation that disables the unavailable direction', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <Pagination
        hasPrevious={false}
        hasNext
        onPrevious={() => {}}
        onNext={onNext}
        summary="Invités 1 à 20 sur 312"
      />,
    );

    const nav = screen.getByRole('navigation', { name: i18next.t('ui:pagination.label') });
    const previous = within(nav).getByRole('button', { name: i18next.t('ui:pagination.previous') });
    expect(previous.hasAttribute('disabled')).toBe(true);
    await user.click(within(nav).getByRole('button', { name: i18next.t('ui:pagination.next') }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(within(nav).getByText('Invités 1 à 20 sur 312')).toBeTruthy();
  });
});

describe('Table', () => {
  it('scrolls in a named, focusable region, with column headers', () => {
    render(
      <Table
        caption="Réponses des invités"
        columns={[
          { key: 'name', header: 'Invité' },
          { key: 'guests', header: 'Personnes', align: 'right' },
        ]}
        rows={[{ id: 'r1', cells: { name: 'Awa Koné', guests: 2 } }]}
      />,
    );

    const region = screen.getByRole('region', { name: 'Réponses des invités' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('columnheader', { name: 'Personnes' }).getAttribute('scope')).toBe(
      'col',
    );
    expect(screen.getByRole('cell', { name: 'Awa Koné' })).toBeTruthy();
  });
});

describe('Avatar', () => {
  it('is named after the person and shows their initials', () => {
    render(<Avatar name="Awa Koné" />);

    expect(screen.getByRole('img', { name: 'Awa Koné' }).textContent).toBe('AK');
    expect(initialsOf('  yao   kouassi  junior ')).toBe('YK');
  });
});

describe('surfaces and states', () => {
  it('render their texts with the right structure', () => {
    render(
      <>
        <Card title="Mariage d'Awa et Yao" description="Samedi 12 décembre">
          <p>248 invités</p>
        </Card>
        <Badge tone="success">Présent</Badge>
        <EmptyState headingLevel="h3" title="Aucun invité" description="Ajoutez-en un." />
      </>,
    );

    expect(screen.getByRole('heading', { level: 3, name: "Mariage d'Awa et Yao" })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Aucun invité' })).toBeTruthy();
    expect(screen.getByText('Présent')).toBeTruthy();
  });

  it('announce a loading state, while the skeleton stays silent', () => {
    const { container } = render(
      <>
        <Spinner />
        <Skeleton className="h-4 w-32" />
      </>,
    );

    expect(screen.getByRole('status').textContent).toBe(i18next.t('ui:spinner.label'));
    expect(container.querySelector('[aria-hidden="true"].animate-pulse')).not.toBeNull();
  });
});
