import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDarkState] = useState(() => {
    const saved = localStorage.getItem('reach-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('reach-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return [dark, setDarkState];
}
