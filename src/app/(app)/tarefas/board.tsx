'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, ErrorNotice } from '@/components/ui';
import { apiPatch, apiPost } from '@/lib/client/api-client';
import { cn, daysUntil, formatDate } from '@/lib/utils';
import { IconPlus } from '@/components/icons';
import type { TaskRow } from './page';

const COLUMNS = [
  { status: 'TODO', label: 'A fazer' },
  { status: 'IN_PROGRESS', label: 'Em andamento' },
  { status: 'WAITING', label: 'Aguardando' },
  { status: 'DONE', label: 'Concluído' },
] as const;

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export function TaskBoard({
  tasks,
  members,
  canWrite,
}: {
  tasks: TaskRow[];
  members: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const move = async (id: string, status: string) => {
    const response = await apiPatch(`/api/tasks/${id}`, { status });
    if (!response.ok) {
      setError(response.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      {canWrite && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setShowForm((value) => !value)}>
            <IconPlus className="size-3.5" />
            Nova tarefa
          </Button>
        </div>
      )}

      {showForm && canWrite && (
        <Card className="p-5">
          <form
            className="grid gap-4 sm:grid-cols-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const response = await apiPost('/api/tasks', {
                title: String(form.get('title') ?? ''),
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
              <label className="label" htmlFor="new-task-title">
                Título
              </label>
              <input id="new-task-title" name="title" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="new-task-assignee">
                Responsável
              </label>
              <select id="new-task-assignee" name="assigneeId" className="input">
                <option value="">Não atribuir</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="new-task-priority">
                Prioridade
              </label>
              <select id="new-task-priority" name="priority" className="input" defaultValue="MEDIUM">
                {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="new-task-due">
                Prazo
              </label>
              <input id="new-task-due" name="dueDate" type="date" className="input" />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="primary" className="w-full">
                Criar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((column) => {
          const items = tasks.filter((task) => task.status === column.status);
          return (
            <div key={column.status} className="min-w-0">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  {column.label}
                </h3>
                <span className="text-[12px] text-[var(--text-subtle)]">{items.length}</span>
              </div>

              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-[12px] text-[var(--text-subtle)]">
                    Vazio
                  </p>
                )}

                {items.map((task) => {
                  const overdue = task.dueDate && daysUntil(task.dueDate) < 0 && task.status !== 'DONE';
                  return (
                    <article
                      key={task.id}
                      className={cn(
                        'card p-3.5',
                        task.status === 'DONE' && 'opacity-60',
                      )}
                    >
                      <p className="text-[13px] font-medium leading-snug">{task.title}</p>

                      {task.description && (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <Badge
                          tone={task.priority === 'URGENT' || task.priority === 'HIGH' ? 'danger' : 'neutral'}
                        >
                          {PRIORITY_LABEL[task.priority]}
                        </Badge>
                        {task.dueDate && (
                          <span
                            className="text-[11px]"
                            style={{ color: overdue ? 'var(--risk-critical)' : 'var(--text-subtle)' }}
                          >
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>

                      {task.process && (
                        <Link
                          href={`/processos/${task.process.id}?aba=tarefas`}
                          className="mt-2 block truncate font-mono text-[11px] text-[var(--text-subtle)] hover:text-[var(--accent)]"
                        >
                          {task.process.number}
                        </Link>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-2">
                        {task.assignee ? (
                          <span className="flex items-center gap-1.5">
                            <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={20} />
                            <span className="truncate text-[11.5px] text-[var(--text-muted)]">
                              {task.assignee.name.split(' ')[0]}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-[var(--text-subtle)]">Sem responsável</span>
                        )}

                        {canWrite && (
                          <select
                            value={task.status}
                            onChange={(event) => move(task.id, event.target.value)}
                            className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--text-muted)]"
                            aria-label="Mover tarefa"
                          >
                            {COLUMNS.map((option) => (
                              <option key={option.status} value={option.status}>
                                {option.label}
                              </option>
                            ))}
                            <option value="CANCELED">Cancelado</option>
                          </select>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
