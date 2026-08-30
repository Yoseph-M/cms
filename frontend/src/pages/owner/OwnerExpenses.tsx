import React, { useEffect } from 'react';
import { ExpensesTracker } from '../../components/common/ExpensesTracker';
import { useHeaderStore } from '../../store/headerStore';

export const OwnerExpenses: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  useEffect(() => {
    setPageTitle({ title: 'Expenses', subtitle: 'Track operational spend' });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: 'Overview', subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange]);
  return <ExpensesTracker />;
};
