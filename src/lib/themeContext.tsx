import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Federation = 'FIDE' | 'USCF';

interface ThemeContextType {
  defaultFederation: Federation;
  setDefaultFederation: (federation: Federation) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [defaultFederation, setDefaultFederation] = useState<Federation>(() => {
    const saved = localStorage.getItem('prepsuite-default-federation');
    return (saved === 'FIDE' || saved === 'USCF') ? saved : 'FIDE';
  });

  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  useEffect(() => {
    localStorage.setItem('prepsuite-default-federation', defaultFederation);
  }, [defaultFederation]);

  return (
    <ThemeContext.Provider value={{ defaultFederation, setDefaultFederation }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
