import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ExpensesTracker } from '../../components/common/ExpensesTracker';
import { useHeaderStore } from '../../store/headerStore';

export const OwnerExpenses: React.FC = () => {
  const { setPageTitle, setShowDateRange } = useHeaderStore();
  const { t } = useTranslation();
  useEffect(() => {
    setPageTitle({ title: t('expenses.title'), subtitle: t('expenses.subtitle') });
    setShowDateRange(false);
    return () => {
      setPageTitle({ title: t('app.overview'), subtitle: '' });
      setShowDateRange(false);
    };
  }, [setPageTitle, setShowDateRange, t]);
  return <ExpensesTracker />;
};
