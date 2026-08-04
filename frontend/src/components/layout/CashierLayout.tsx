import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../common/Header';

export const CashierLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Header />
      {/* Zero chrome, full-screen POS queue */}
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
};
