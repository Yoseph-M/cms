import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { OwnerPrinters } from '../owner/OwnerPrinters';
import { useHeaderStore } from '../../store/headerStore';

/** Manager view of the printer stations — shares the owner's panel in full edit mode. */
export const ManagerPrinters: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { t } = useTranslation();

  useEffect(() => {
    setPageTitle({ title: t('printers.title'), subtitle: t('printers.subtitleFull') });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: t('app.overview'), subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, t]);

  return <OwnerPrinters />;
};
