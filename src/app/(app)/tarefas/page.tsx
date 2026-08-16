import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { listMembers, listTasks } from '@/server/workspace';
import { serialize } from '@/server/serialize';
import { PageBody, PageHeader } from '@/components/page-header';
import { TaskBoard } from './board';

export const metadata: Metadata = { title: 'Tarefas' };
export const dynamic = 'force-dynamic';

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  assignee: { id: string; name: string; avatarColor: string } | null;
  process: { id: string; number: string } | null;
}

export default async function TasksPage() {
  const ctx = await requirePermission('task:read');

  const [tasks, members] = await Promise.all([
    listTasks(ctx.organization.id),
    listMembers(ctx.organization.id),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Tarefas"
        description="Quadro do escritório. Achados das análises podem virar tarefa com um clique na tela do processo."
      />

      <div className="mt-6">
        <TaskBoard
          tasks={serialize<TaskRow[]>(tasks)}
          members={members.map((member) => ({ id: member.user.id, name: member.user.name }))}
          canWrite={ctx.can('task:write')}
        />
      </div>
    </PageBody>
  );
}
