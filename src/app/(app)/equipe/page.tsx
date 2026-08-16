import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/session';
import { listMembers } from '@/server/workspace';
import { quotaSnapshot } from '@/server/quota';
import { serialize } from '@/server/serialize';
import { PageBody, PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, permissionsFor } from '@/lib/auth/permissions';
import type { Role } from '@prisma/client';
import { TeamManager } from './manager';

export const metadata: Metadata = { title: 'Equipe' };
export const dynamic = 'force-dynamic';

export interface MemberRow {
  id: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarColor: string;
    lastLoginAt: string | null;
  };
}

export default async function TeamPage() {
  const ctx = await requirePermission('team:read');

  const [members, quota] = await Promise.all([
    listMembers(ctx.organization.id),
    quotaSnapshot(ctx.organization.id),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Equipe"
        description={`${members.length} de ${
          quota.plan.maxUsers < 0 ? '∞' : quota.plan.maxUsers
        } usuário(s) do plano. Cada perfil tem um conjunto fixo de permissões.`}
      />

      <div className="mt-6">
        <TeamManager
          members={serialize<MemberRow[]>(members)}
          canManage={ctx.can('team:manage')}
          currentUserId={ctx.user.id}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
          O que cada perfil pode fazer
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <Card key={role} className="p-4">
              <p className="text-[14px] font-semibold">{ROLE_LABELS[role]}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                {ROLE_DESCRIPTIONS[role]}
              </p>
              <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--text-subtle)]">
                {permissionsFor(role).length} permissões ·{' '}
                {permissionsFor(role).includes('analysis:run')
                  ? 'pode executar análises de IA'
                  : 'não executa análises de IA'}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </PageBody>
  );
}
