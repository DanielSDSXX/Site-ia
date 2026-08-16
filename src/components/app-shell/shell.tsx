'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Permission } from '@/lib/auth/permissions';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';
import {
  IconBell,
  IconBrain,
  IconBriefcase,
  IconCalendar,
  IconCheckSquare,
  IconClose,
  IconDashboard,
  IconDocument,
  IconLogout,
  IconMenu,
  IconProcess,
  IconReport,
  IconScale,
  IconSearch,
  IconSettings,
  IconUsers,
} from '@/components/icons';
import { GROUP_LABELS, NAV_ITEMS, type NavItem } from './nav-items';
import { CommandPalette } from './command-palette';
import { NotificationBell } from './notifications';

const ICONS = {
  dashboard: IconDashboard,
  process: IconProcess,
  document: IconDocument,
  brain: IconBrain,
  calendar: IconCalendar,
  task: IconCheckSquare,
  scale: IconScale,
  report: IconReport,
  briefcase: IconBriefcase,
  users: IconUsers,
  settings: IconSettings,
} as const;

interface ShellProps {
  user: { id: string; name: string; email: string; avatarColor: string; isPlatformAdmin: boolean };
  organization: { id: string; name: string; slug: string };
  role: string;
  permissions: Permission[];
  demoAI: boolean;
  children: React.ReactNode;
}

export function AppShell({ user, organization, role, permissions, demoAI, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Ctrl+K / Cmd+K abre a busca global de qualquer tela.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  const logout = useCallback(async () => {
    await apiPost('/api/auth/logout');
    router.push('/entrar');
    router.refresh();
  }, [router]);

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      {/* --------------------------------------------------------- Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Logo className="size-6.5" />
            <span className="text-[14.5px] font-semibold tracking-tight">LegalMind AI</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-[var(--text-muted)] lg:hidden"
            aria-label="Fechar menu"
          >
            <IconClose className="size-4.5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {(['principal', 'inteligencia', 'operacao', 'escritorio'] as const).map((group) => {
            const items = visibleItems.filter((item) => item.group === group);
            if (items.length === 0) return null;

            return (
              <div key={group} className="mb-5">
                {GROUP_LABELS[group] && (
                  <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--text-subtle)]">
                    {GROUP_LABELS[group]}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.href}>
                      <NavLink item={item} active={isActive(pathname, item.href)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {user.isPlatformAdmin && (
            <div className="mb-5">
              <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--text-subtle)]">
                Plataforma
              </p>
              <Link
                href="/admin"
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
                  pathname.startsWith('/admin')
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]',
                )}
              >
                <IconSettings className="size-4.5" />
                Administração
              </Link>
            </div>
          )}
        </nav>

        <div className="shrink-0 border-t border-[var(--border)] p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <Avatar name={user.name} color={user.avatarColor} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user.name}</p>
              <p className="truncate text-[11.5px] text-[var(--text-subtle)]">
                {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role} · {organization.name}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
              className="rounded-md p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
            >
              <IconLogout className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ---------------------------------------------------------- Conteúdo */}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="text-[var(--text-muted)] lg:hidden"
            aria-label="Abrir menu"
          >
            <IconMenu className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 flex-1 items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-left text-[13px] text-[var(--text-subtle)] transition-colors hover:border-[var(--border-strong)] sm:max-w-md"
          >
            <IconSearch className="size-4" />
            <span className="flex-1 truncate">Buscar processos, clientes, documentos…</span>
            <kbd className="hidden rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[10.5px] sm:block">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            {demoAI && (
              <span
                className="mr-1 hidden rounded-md px-2 py-1 text-[11px] font-medium md:block"
                style={{ background: 'var(--risk-medium-bg)', color: 'var(--risk-medium)' }}
                title="Nenhum modelo de linguagem está conectado. As análises usam verificação estrutural determinística."
              >
                Modo demonstração
              </span>
            )}
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        <main className="min-h-[calc(100dvh-3.5rem)]">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
        active
          ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]',
      )}
    >
      <Icon className="size-4.5" />
      {item.label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
