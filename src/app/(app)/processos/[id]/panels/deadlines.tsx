'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorNotice, InfoNotice } from '@/components/ui';
import { apiPatch, apiPost, apiPut } from '@/lib/client/api-client';
import { daysUntil, formatDate } from '@/lib/utils';
import { COMMON_DEADLINES } from '@/lib/deadlines/calculator';
import { IconCalendar, IconPlus } from '@/components/icons';
import type { ProcessDto } from '../types';

export function DeadlinesPanel({
  process,
  members,
  canWrite,
}: {
  process: ProcessDto;
  members: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  const open = process.deadlines.filter((d) => d.status === 'OPEN');
  const closed = process.deadlines.filter((d) => d.status !== 'OPEN');

  const setStatus = async (id: string, status: string) => {
    await apiPatch(`/api/deadlines/${id}`, { status });
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {canWrite && (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <span className="flex items-center gap-2.5">
              <IconPlus className="size-4.5 text-[var(--text-muted)]" />
              <span className="text-[15px] font-semibold">Novo prazo</span>
            </span>
            <span className="text-[12.5px] text-[var(--text-subtle)]">
              {showForm ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>

          {showForm && (
            <div className="border-t border-[var(--border)] p-5">
              <DeadlineForm
                processId={process.id}
                members={members}
                onCreated={() => {
                  setShowForm(false);
                  router.refresh();
                }}
              />
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <IconCalendar className="size-4.5 text-[var(--text-muted)]" />
            Prazos em aberto
          </h3>
        </div>

        {open.length === 0 ? (
          <EmptyState title="Nenhum prazo em aberto" />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {open.map((deadline) => {
              const days = daysUntil(deadline.dueDate);
              const overdue = days < 0;
              return (
                <li key={deadline.id} className="flex items-start gap-4 px-5 py-4">
                  <div
                    className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg text-center"
                    style={{
                      background: overdue
                        ? 'var(--risk-critical-bg)'
                        : days <= 3
                          ? 'var(--risk-high-bg)'
                          : 'var(--bg-subtle)',
                      color: overdue
                        ? 'var(--risk-critical)'
                        : days <= 3
                          ? 'var(--risk-high)'
                          : 'var(--text-muted)',
                    }}
                  >
                    <span className="text-[16px] font-semibold leading-none">{Math.abs(days)}</span>
                    <span className="mt-0.5 text-[9px] uppercase leading-none">
                      {overdue ? 'atrás' : 'dias'}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{deadline.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">
                      Vencimento: {formatDate(deadline.dueDate)}
                      {deadline.legalBasis ? ` · ${deadline.legalBasis}` : ''}
                    </p>
                    {deadline.computed && deadline.computationNote && (
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
                        {deadline.computationNote}
                      </p>
                    )}
                  </div>

                  {canWrite && (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" onClick={() => setStatus(deadline.id, 'DONE')}>
                        Cumprido
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(deadline.id, 'CANCELED')}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {closed.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-[15px] font-semibold">Histórico</h3>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {closed.map((deadline) => (
              <li key={deadline.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-[13.5px]">{deadline.title}</p>
                  <p className="text-[12px] text-[var(--text-subtle)]">
                    {formatDate(deadline.dueDate)}
                  </p>
                </div>
                <Badge tone={deadline.status === 'DONE' ? 'success' : deadline.status === 'MISSED' ? 'danger' : 'neutral'}>
                  {deadline.status === 'DONE'
                    ? 'Cumprido'
                    : deadline.status === 'MISSED'
                      ? 'Perdido'
                      : 'Cancelado'}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <InfoNotice>
        O cálculo automático segue a regra geral do CPC (dias úteis, art. 219; exclusão do dia do
        começo, art. 224; recesso de 20/12 a 20/01, art. 220) e os feriados nacionais. Ele{' '}
        <strong>não</strong> conhece feriados locais, suspensões do tribunal nem regimes especiais.
        Confira sempre antes de confiar na data.
      </InfoNotice>
    </div>
  );
}

function DeadlineForm({
  processId,
  members,
  onCreated,
}: {
  processId: string;
  members: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<'compute' | 'fixed'>('compute');
  const [days, setDays] = useState(15);
  const [baseDate, setBaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [countingMode, setCountingMode] = useState<'BUSINESS_DAYS' | 'CALENDAR_DAYS'>('BUSINESS_DAYS');
  const [preview, setPreview] = useState<{ dueDate: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const computePreview = async () => {
    const response = await apiPut<{ dueDate: string; note: string }>('/api/deadlines', {
      baseDate,
      days,
      countingMode,
    });
    if (response.ok) setPreview(response.data);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      processId,
      title: String(form.get('title') ?? ''),
      legalBasis: String(form.get('legalBasis') ?? '') || null,
      priority: String(form.get('priority') ?? 'MEDIUM'),
      responsibleId: String(form.get('responsibleId') ?? '') || null,
    };

    if (mode === 'compute') {
      payload.baseDate = baseDate;
      payload.days = days;
      payload.countingMode = countingMode;
    } else {
      payload.dueDate = String(form.get('dueDate') ?? '');
    }

    const response = await apiPost('/api/deadlines', payload);
    setLoading(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    onCreated();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">
            Descrição do prazo *
          </label>
          <input id="title" name="title" required className="input" placeholder="Réplica à contestação" />
        </div>

        <div className="sm:col-span-2">
          <label className="label">Modelos frequentes</label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_DEADLINES.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setDays(item.days);
                  setMode('compute');
                  const titleInput = document.getElementById('title') as HTMLInputElement | null;
                  const basisInput = document.getElementById('legalBasis') as HTMLInputElement | null;
                  if (titleInput) titleInput.value = item.label;
                  if (basisInput) basisInput.value = item.legalBasis;
                }}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {item.label} ({item.days}d)
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="legalBasis">
            Fundamento legal
          </label>
          <input id="legalBasis" name="legalBasis" className="input" placeholder="art. 350 do CPC" />
        </div>

        <div>
          <label className="label" htmlFor="responsibleId">
            Responsável
          </label>
          <select id="responsibleId" name="responsibleId" className="input">
            <option value="">Não atribuir</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="priority">
            Prioridade
          </label>
          <select id="priority" name="priority" className="input" defaultValue="MEDIUM">
            <option value="LOW">Baixa</option>
            <option value="MEDIUM">Média</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>

        <div>
          <label className="label">Forma de definição</label>
          <div className="flex rounded-lg border border-[var(--border)] p-0.5">
            {(
              [
                ['compute', 'Calcular'],
                ['fixed', 'Data fixa'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] transition-colors ${
                  mode === value
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'compute' ? (
        <div className="rounded-lg bg-[var(--bg-subtle)] p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="baseDate">
                Data-base (intimação)
              </label>
              <input
                id="baseDate"
                type="date"
                value={baseDate}
                onChange={(event) => setBaseDate(event.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="days">
                Dias
              </label>
              <input
                id="days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="countingMode">
                Contagem
              </label>
              <select
                id="countingMode"
                value={countingMode}
                onChange={(event) => setCountingMode(event.target.value as never)}
                className="input"
              >
                <option value="BUSINESS_DAYS">Dias úteis</option>
                <option value="CALENDAR_DAYS">Dias corridos</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button type="button" size="sm" onClick={computePreview}>
              Calcular
            </Button>
            {preview && (
              <p className="text-[12.5px]">
                Vencimento estimado:{' '}
                <strong className="font-semibold">{formatDate(preview.dueDate)}</strong>
              </p>
            )}
          </div>

          {preview && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
              {preview.note}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="dueDate">
            Data de vencimento
          </label>
          <input id="dueDate" name="dueDate" type="date" required className="input" />
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={loading}>
          Salvar prazo
        </Button>
      </div>
    </form>
  );
}
