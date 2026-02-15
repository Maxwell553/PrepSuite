import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';
type Federation = 'FIDE' | 'USCF';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  defaultFederation: Federation;
  setDefaultFederation: (federation: Federation) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('prepsuite-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const [defaultFederation, setDefaultFederation] = useState<Federation>(() => {
    const saved = localStorage.getItem('prepsuite-default-federation');
    return (saved === 'FIDE' || saved === 'USCF') ? saved : 'FIDE';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    } else {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    }
    localStorage.setItem('prepsuite-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('prepsuite-default-federation', defaultFederation);
  }, [defaultFederation]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, defaultFederation, setDefaultFederation }}>
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
