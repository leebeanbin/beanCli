'use client';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('bean-theme');
    const isDark = saved
      ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('bean-theme', next ? 'dark' : 'light');
  }

  return (
    <button
      onClick={toggle}
      className="font-mono text-xs text-fg-2 hover:text-accent px-2 py-1 border border-rim hover:border-accent shadow-px hover:shadow-px-a transition-none"
      title="Toggle dark/light mode"
    >
      {dark ? '[◐ DARK]' : '[○ LITE]'}
    </button>
  );
}
