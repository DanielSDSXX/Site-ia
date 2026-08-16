'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { apiPatch } from '@/lib/client/api-client';
import { cn, daysUntil, formatDate } from '@/lib/utils';
import { IconCalendar } from '@/components/icons';
import type { DeadlineRow } from './page';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type Filter = 'OPEN' | 'ALL' | 'DONE' | 'MISSED';

/**
 * Agenda de prazos: calendário mensal + lista.
 *
 * O calendário existe para dar noção de densidade (onde a semana aperta); a
 * lista é onde o trabalho acontece.
 */
export function DeadlineCalendar({
  deadlines,
  members,
  canWrite,
}: {
  deadlines: DeadlineRow[];
  members: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === 'ALL' ? deadlines : deadlines.filter((d) => d.status === filter)),
    [deadlines, filter],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, DeadlineRow[]>();
    for (const deadline of filtered) {
      const key = deadline.dueDate.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), deadline]);
    }
    return map;
  }, [filtered]);

  const days = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const visible = selectedDay ? (byDay.get(selectedDay) ?? []) : filtered;

  const setStatus = async (id: string, status: string) => {
    await apiPatch(`/api/deadlines/${id}`, { status });
    router.refresh();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] font-semibold capitalize">
            {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor)}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="rounded px-2 py-1 text-[13px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="rounded px-2 py-1 text-[13px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((day) => (
            <span key={day} className="py-1 text-[10.5px] font-semibold text-[var(--text-subtle)]">
              {day}
            </span>
          ))}

          {days.map(({ date, currentMonth }) => {
            const key = toIsoDay(date);
            const items = byDay.get(key) ?? [];
            const isToday = key === toIsoDay(new Date());
            const selected = selectedDay === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(selected ? null : key)}
                className={cn(
                  'relative flex h-9 flex-col items-center justify-center rounded-lg text-[12.5px] transition-colors',
                  currentMonth ? 'text-[var(--text)]' : 'text-[var(--text-subtle)] opacity-45',
                  selected && 'bg-[var(--accent)] text-[var(--accent-fg)]',
                  !selected && isToday && 'ring-1 ring-[var(--accent)]',
                  !selected && 'hover:bg-[var(--bg-subtle)]',
                )}
              >
                {date.getDate()}
                {items.length > 0 && (
                  <span
                    className="absolute bottom-1 size-1 rounded-full"
                    style={{
                      background: selected
                        ? 'var(--accent-fg)'
                        : items.some((item) => daysUntil(item.dueDate) <= 1)
                          ? 'var(--risk-critical)'
                          : 'var(--accent)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className="mt-3 w-full rounded-lg border border-[var(--border)] py-1.5 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            Mostrar todos os prazos
          </button>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3">
          <p className="mr-auto text-[14px] font-semibold">
            {selectedDay ? `Prazos em ${formatDate(selectedDay)}` : 'Prazos'}
          </p>
          <div className="flex rounded-lg border border-[var(--border)] p-0.5">
            {(
              [
                ['OPEN', 'Em aberto'],
                ['MISSED', 'Perdidos'],
                ['DONE', 'Cumpridos'],
                ['ALL', 'Todos'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[12px] transition-colors',
                  filter === value
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<IconCalendar className="size-5" />}
            title="Nenhum prazo nesta seleção"
            description="Prazos são cadastrados na tela de cada processo, com cálculo automático a partir da data de intimação."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((deadline) => {
                const days = daysUntil(deadline.dueDate);
                const overdue = days < 0 && deadline.status === 'OPEN';

                return (
                  <li key={deadline.id} className="flex items-start gap-4 px-5 py-3.5">
                    <div
                      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg"
                      style={{
                        background: overdue
                          ? 'var(--risk-critical-bg)'
                          : days <= 3 && deadline.status === 'OPEN'
                            ? 'var(--risk-high-bg)'
                            : 'var(--bg-subtle)',
                        color: overdue
                          ? 'var(--risk-critical)'
                          : days <= 3 && deadline.status === 'OPEN'
                            ? 'var(--risk-high)'
                            : 'var(--text-muted)',
                      }}
                    >
                      <span className="text-[15px] font-semibold leading-none">
                        {new Date(deadline.dueDate).getUTCDate()}
                      </span>
                      <span className="mt-0.5 text-[9px] uppercase leading-none">
                        {new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
                          .format(new Date(deadline.dueDate))
                          .replace('.', '')}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium">{deadline.title}</p>
                      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                        {deadline.process ? (
                          <Link
                            href={`/processos/${deadline.process.id}?aba=prazos`}
                            className="font-mono hover:text-[var(--accent)] hover:underline"
                          >
                            {deadline.process.number}
                          </Link>
                        ) : (
                          'Sem processo vinculado'
                        )}
                        {deadline.legalBasis ? ` · ${deadline.legalBasis}` : ''}
                        {deadline.responsible ? ` · ${deadline.responsible.name}` : ''}
                      </p>
                      {deadline.computed && (
                        <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                          Data calculada automaticamente — confira feriados locais.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        tone={
                          deadline.status === 'DONE'
                            ? 'success'
                            : deadline.status === 'MISSED'
                              ? 'danger'
                              : overdue
                                ? 'danger'
                                : 'neutral'
                        }
                      >
                        {deadline.status === 'DONE'
                          ? 'Cumprido'
                          : deadline.status === 'MISSED'
                            ? 'Perdido'
                            : deadline.status === 'CANCELED'
                              ? 'Cancelado'
                              : overdue
                                ? `${Math.abs(days)} d atrás`
                                : `em ${days} d`}
                      </Badge>

                      {canWrite && deadline.status === 'OPEN' && (
                        <Button size="sm" onClick={() => setStatus(deadline.id, 'DONE')}>
                          Cumprido
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function buildMonthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, currentMonth: date.getMonth() === cursor.getMonth() };
  });
}

function toIsoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
