'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorNotice } from '@/components/ui';
import { apiPatch, apiPost } from '@/lib/client/api-client';
import { formatDate } from '@/lib/utils';
import { IconCheckSquare, IconPlus } from '@/components/icons';
import type { ProcessDto } from '../types';

const STATUS_LABEL: Record<string, string> = {
  TODO: 'A fazer',
  IN_PROGRESS: 'Em andamento',
  WAITING: 'Aguardando',
  DONE: 'Concluído',
  CANCELED: 'Cancelado',
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export function TasksPanel({
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
  const [error, setError] = useState<string | null>(null);

  const change = async (id: string, status: string) => {
    const response = await apiPatch(`/api/tasks/${id}`, { status });
    if (!response.ok) setError(response.message);
    router.refresh();
  };

  const active = process.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELED');
  const done = process.tasks.filter((task) => task.status === 'DONE' || task.status === 'CANCELED');

  return (
    <div className="space-y-5">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      {canWrite && (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <span className="flex items-center gap-2.5">
              <IconPlus className="size-4.5 text-[var(--text-muted)]" />
              <span className="text-[15px] font-semibold">Nova tarefa</span>
            </span>
            <span className="text-[12.5px] text-[var(--text-subtle)]">
              {showForm ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>

          {showForm && (
            <form
              className="grid gap-4 border-t border-[var(--border)] p-5 sm:grid-cols-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const response = await apiPost('/api/tasks', {
                  processId: process.id,
                  title: String(form.get('title') ?? ''),
                  description: String(form.get('description') ?? '') || null,
                  assigneeId: String(form.get('assigneeId') ?? '') || null,
                  priority: String(form.get('priority') ?? 'MEDIUM'),
                  dueDate: String(form.get('dueDate') ?? '') || null,
                });
                if (!response.ok) {
                  setError(response.message);
                  return;
                }
                setShowForm(false);
                router.refresh();
              }}
            >
              <div className="sm:col-span-2">
                <label className="label" htmlFor="task-title">
                  Título *
                </label>
                <input id="task-title" name="title" required className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="task-description">
                  Descrição
                </label>
                <textarea id="task-description" name="description" rows={2} className="input resize-y" />
              </div>
              <div>
                <label className="label" htmlFor="task-assignee">
                  Responsável
                </label>
                <select id="task-assignee" name="assigneeId" className="input">
                  <option value="">Não atribuir</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="task-priority">
                  Prioridade
                </label>
                <select id="task-priority" name="priority" className="input" defaultValue="MEDIUM">
                  {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="task-due">
                  Prazo
                </label>
                <input id="task-due" name="dueDate" type="date" className="input" />
              </div>
              <div className="flex items-end justify-end sm:col-span-2">
                <Button type="submit" variant="primary">
                  Criar tarefa
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold">
            <IconCheckSquare className="size-4.5 text-[var(--text-muted)]" />
            Tarefas ativas
          </h3>
        </div>

        {active.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa ativa"
            description="Achados das análises podem ser convertidos em tarefa com um clique."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {active.map((task) => (
              <li key={task.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{task.title}</p>
                  {task.description && (
                    <p className="mt-0.5 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--text-subtle)]">
                    <Badge tone={task.priority === 'URGENT' || task.priority === 'HIGH' ? 'danger' : 'neutral'}>
                      {PRIORITY_LABEL[task.priority]}
                    </Badge>
                    <span>{STATUS_LABEL[task.status]}</span>
                    {task.dueDate && <span>· {formatDate(task.dueDate)}</span>}
                  </div>
                </div>

                {canWrite && (
                  <select
                    value={task.status}
                    onChange={(event) => change(task.id, event.target.value)}
                    className="input w-auto min-w-[130px] shrink-0 text-[12.5px]"
                    aria-label="Alterar situação"
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {done.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h3 className="text-[15px] font-semibold">Concluídas e canceladas</h3>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {done.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-[13px] text-[var(--text-muted)] line-through">{task.title}</span>
                <Badge tone={task.status === 'DONE' ? 'success' : 'neutral'}>
                  {STATUS_LABEL[task.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
