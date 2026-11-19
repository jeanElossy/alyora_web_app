import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Avatar } from '../../../components/ui/Avatar.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Tooltip } from '../../../components/ui/Tooltip.jsx';
import { NAMESPACE } from '../namespace.js';
import { DemoTitle, Section } from '../Section.jsx';

const BADGE_TONES = /** @type {const} */ ([
  'neutral',
  'forest',
  'champagne',
  'success',
  'warning',
  'danger',
]);

export function ActionsSection() {
  const { t } = useTranslation(NAMESPACE);

  return (
    <Section
      id="actions"
      title={t('sections.actions.title')}
      description={t('sections.actions.description')}
    >
      <div className="grid grid-cols-1 gap-12">
        <div>
          <DemoTitle>{t('buttons.title')}</DemoTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Button>{t('buttons.primary')}</Button>
            <Button variant="secondary">{t('buttons.secondary')}</Button>
            <Button variant="outline">{t('buttons.outline')}</Button>
            <Button variant="ghost">{t('buttons.ghost')}</Button>
            <Button variant="danger">{t('buttons.danger')}</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline">
              {t('buttons.small')}
            </Button>
            <Button size="lg">{t('buttons.large')}</Button>
            <Button loading>{t('buttons.loading')}</Button>
            <Button disabled>{t('buttons.disabled')}</Button>
            <Button asChild variant="ghost">
              <Link to="/">{t('buttons.link')}</Link>
            </Button>
          </div>
        </div>

        <div>
          <DemoTitle>{t('badges.title')}</DemoTitle>
          <div className="flex flex-wrap gap-2">
            {BADGE_TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {t(`badges.${tone}`)}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
          <div>
            <DemoTitle>{t('avatars.title')}</DemoTitle>
            <div className="flex items-center gap-4">
              <Avatar size="sm" name={t('avatars.single')} />
              <Avatar name={t('avatars.initials')} />
              <Avatar size="lg" name={t('avatars.photo')} />
              <div className="flex -space-x-3">
                <Avatar size="sm" name={t('avatars.photo')} />
                <Avatar size="sm" name={t('avatars.initials')} />
                <Avatar size="sm" name={t('avatars.single')} />
              </div>
            </div>
          </div>
          <div>
            <DemoTitle>{t('tooltip.title')}</DemoTitle>
            <Tooltip content={t('tooltip.content')}>
              <Button variant="outline">{t('tooltip.trigger')}</Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </Section>
  );
}
