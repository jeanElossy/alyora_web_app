import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/Button.jsx';
import { Drawer } from '../../../components/ui/Drawer.jsx';
import { Modal, ModalClose } from '../../../components/ui/Modal.jsx';
import { toast } from '../../../components/ui/toast-store.js';
import { NAMESPACE } from '../namespace.js';
import { DemoTitle, Section } from '../Section.jsx';

export function OverlaysSection() {
  const { t } = useTranslation(NAMESPACE);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <Section
      id="overlays"
      title={t('sections.overlays.title')}
      description={t('sections.overlays.description')}
    >
      <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
        <div>
          <DemoTitle>{t('modal.title')}</DemoTitle>
          <Modal
            open={modalOpen}
            onOpenChange={setModalOpen}
            trigger={<Button variant="outline">{t('modal.open')}</Button>}
            title={t('modal.heading')}
            description={t('modal.description')}
            footer={
              <>
                <ModalClose asChild>
                  <Button variant="outline">{t('modal.cancel')}</Button>
                </ModalClose>
                <Button
                  onClick={() => {
                    setModalOpen(false);
                    toast({ title: t('modal.heading'), tone: 'success' });
                  }}
                >
                  {t('modal.confirm')}
                </Button>
              </>
            }
          >
            <p className="text-sm leading-relaxed text-charcoal">{t('modal.body')}</p>
          </Modal>
        </div>
        <div>
          <DemoTitle>{t('drawer.title')}</DemoTitle>
          <Drawer
            trigger={<Button variant="outline">{t('drawer.open')}</Button>}
            title={t('drawer.heading')}
            description={t('drawer.description')}
            footer={
              <ModalClose asChild>
                <Button variant="outline">{t('drawer.close')}</Button>
              </ModalClose>
            }
          >
            <p className="text-sm leading-relaxed text-charcoal">{t('drawer.body')}</p>
          </Drawer>
        </div>
        <div>
          <DemoTitle>{t('toast.title')}</DemoTitle>
          <div className="flex flex-col items-start gap-3">
            <Button
              variant="outline"
              onClick={() =>
                toast({
                  title: t('toast.successTitle'),
                  description: t('toast.successDescription'),
                  tone: 'success',
                })
              }
            >
              {t('toast.success')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast({
                  title: t('toast.errorTitle'),
                  description: t('toast.errorDescription'),
                  tone: 'error',
                })
              }
            >
              {t('toast.error')}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
