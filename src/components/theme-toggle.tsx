'use client';

import { useEffect, useState } from 'react';
import { IconMoon, IconSun } from './icons';

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('lm-theme', next ? 'dark' : 'light');
    } catch {
      /* localStorage indisponível (modo privado): o tema volta ao padrão */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={dark ? 'Tema claro' : 'Tema escuro'}
      className={
        className ??
        'flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]'
      }
    >
      {mounted && dark ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
    </button>
  );
}
