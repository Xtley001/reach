import { useState, useEffect } from 'react';

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// A-5: DarkModeToggle parity — first-time visitors get the OS-level theme
// instead of always defaulting to light (theme-init.js does the same check
// before first paint so there's no flash). Once a user makes an explicit
// choice, that choice is persisted and always wins over system preference.
export function useTheme() {
  const [dark, setDarkState] = useState(() => {
    const saved = localStorage.getItem('reach-theme');
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
    return systemPrefersDark();
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('reach-theme', dark ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('reach:theme', { detail: dark ? 'dark' : 'light' }));
  }, [dark]);

  // Live-follow the OS theme only for visitors who have never explicitly
  // chosen — once they've picked, respect that pick regardless of OS changes.
  useEffect(() => {
    if (localStorage.getItem('reach-theme')) return undefined;
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setDarkState(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  return [dark, setDarkState];
}
