import React, { useEffect } from 'react';
import { OwnerPrinters } from '../owner/OwnerPrinters';
import { useHeaderStore } from '../../store/headerStore';

/** Manager view of the printer stations — shares the owner's panel in full edit mode. */
export const ManagerPrinters: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();

  useEffect(() => {
    setPageTitle({ title: 'Printers', subtitle: 'Ticket printer and stations for this terminal' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);

  return <OwnerPrinters />;
};
