import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('cafeflow:sidebar-collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const toggle = () => setCollapsed((prev) => !prev);

  useEffect(() => {
    localStorage.setItem('cafeflow:sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};
