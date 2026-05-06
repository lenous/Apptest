import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Theme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  colors: typeof lightColors;
};

const lightColors = {
  background: '#f3f4f6',
  card: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
  primary: '#1a56db',
  primaryDark: '#1d4ed8',
  headerBg: '#1a56db',
  tabBarBg: '#ffffff',
  tabActive: '#1a56db',
  tabInactive: '#6b7280',
  inputBg: '#f9fafb',
  inputBorder: '#d1d5db',
  statBg: '#f9fafb',
  danger: '#ef4444',
  success: '#15803d',
  warning: '#d97706',
};

const darkColors: typeof lightColors = {
  background: '#111827',
  card: '#1f2937',
  text: '#f9fafb',
  textSecondary: '#9ca3af',
  border: '#374151',
  primary: '#3b82f6',
  primaryDark: '#60a5fa',
  headerBg: '#111827',
  tabBarBg: '#1f2937',
  tabActive: '#60a5fa',
  tabInactive: '#6b7280',
  inputBg: '#374151',
  inputBorder: '#4b5563',
  statBg: '#374151',
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
};

const THEME_KEY = 'app_theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  toggleTheme: () => {},
  colors: lightColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light') setTheme(stored);
    });
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(THEME_KEY, next);
      return next;
    });
  }

  const isDark = theme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export { lightColors, darkColors };
