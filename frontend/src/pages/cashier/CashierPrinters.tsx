import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { OwnerPrinters } from '../owner/OwnerPrinters';
import { useHeaderStore } from '../../store/headerStore';

/**
 * Printer stations for the cashier terminal — the same editable panel the owner
 * and manager use. The cashier is the person standing next to the printer, so
 * adding, editing, and removing a station is theirs to do.
 */
export const CashierPrinters: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { t } = useTranslation();

  useEffect(() => {
    setPageTitle({ title: t('printers.title'), subtitle: t('printers.subtitleTerminal') });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: t('app.overview'), subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, t]);

  return <OwnerPrinters />;
};

export default CashierPrinters;
