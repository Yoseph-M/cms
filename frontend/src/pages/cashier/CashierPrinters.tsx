import React, { useEffect } from 'react';
import { OwnerPrinters } from '../owner/OwnerPrinters';
import { useHeaderStore } from '../../store/headerStore';

/**
 * Printer stations for the cashier terminal — the same editable panel the owner
 * and manager use. The cashier is the person standing next to the printer, so
 * adding, editing, and removing a station is theirs to do.
 */
export const CashierPrinters: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Printers', subtitle: 'Set up the printer for this terminal' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  return <OwnerPrinters />;
};

export default CashierPrinters;
