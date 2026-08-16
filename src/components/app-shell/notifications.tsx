'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/client/api-client';
import { relativeTime } from '@/lib/utils';
import { IconBell } from '@/components/icons';

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const KIND_COLOR: Record<string, string> = {
  HIGH_RISK_DETECTED: 'var(--risk-critical)',
  DEADLINE_APPROACHING: 'var(--risk-high)',
  ANALYSIS_COMPLETED: 'var(--accent)',
  DOCUMENT_PROCESSED: 'var(--risk-low)',
  NEW_MOVEMENT: 'var(--risk-medium)',
  TASK_ASSIGNED: 'var(--accent)',
  SYSTEM: 'var(--text-subtle)',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const response = await apiGet<{ items: NotificationItem[]; unreadCount: number }>(
      '/api/notifications',
    );
    if (response.ok) {
      setItems(response.data.items);
      setUnread(response.data.unreadCount);
    }
  };

  useEffect(() => {
    void load();
    // Recarrega a cada 2 minutos: alertas de prazo não precisam de tempo real.
    const timer = setInterval(() => void load(), 120_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const markAllRead = async () => {
    await apiPost('/api/notifications', {});
    setUnread(0);
    setItems((current) => current.map((item) => ({ ...item, readAt: new Date().toISOString() })));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
        aria-label={`Notificações${unread > 0 ? ` (${unread} não lidas)` : ''}`}
        className="relative flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
      >
        <IconBell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-[15px] items-center justify-center rounded-full bg-[var(--risk-critical)] px-1 text-[9.5px] font-semibold leading-[15px] text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[360px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] shadow-[var(--shadow-pop)] animate-in">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <p className="text-[13px] font-semibold">Notificações</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[12px] text-[var(--accent)] hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-10 text-center text-[13px] text-[var(--text-subtle)]">
                Nada por aqui. Você está em dia.
              </p>
            )}

            {items.map((item) => {
              const content = (
                <div
                  className="flex gap-3 border-b border-[var(--border)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--bg-subtle)]"
                  style={{ opacity: item.readAt ? 0.62 : 1 }}
                >
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: KIND_COLOR[item.kind] ?? 'var(--text-subtle)' }}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium leading-snug">{item.title}</p>
                    {item.body && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              );

              return item.href ? (
                <Link key={item.id} href={item.href} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              ) : (
                <div key={item.id}>{content}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
