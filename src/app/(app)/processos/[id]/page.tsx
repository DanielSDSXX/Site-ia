import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { getLatestAnalyses, getProcessDetail, getProcessFindings } from '@/server/processes';
import { listMembers } from '@/server/workspace';
import { serialize } from '@/server/serialize';
import { NotFoundError } from '@/lib/errors';
import { isDemoAI } from '@/lib/env';
import { PageBody } from '@/components/page-header';
import { ProcessWorkspace } from './workspace';
import type { AnalysisDto, FindingDto, ProcessDto } from './types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const ctx = await requirePermission('process:read');
    const process = await getProcessDetail(ctx.organization.id, id);
    return { title: `Processo ${process.number}` };
  } catch {
    return { title: 'Processo' };
  }
}

export default async function ProcessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission('process:read');
  const { id } = await params;

  let detail;
  try {
    detail = await getProcessDetail(ctx.organization.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const [findings, analysesMap, members] = await Promise.all([
    getProcessFindings(ctx.organization.id, id),
    getLatestAnalyses(ctx.organization.id, id),
    listMembers(ctx.organization.id),
  ]);

  return (
    <PageBody>
      <nav className="mb-1.5 text-[12.5px] text-[var(--text-subtle)]">
        <Link href="/processos" className="hover:text-[var(--text-muted)]">
          Processos
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono">{detail.number}</span>
      </nav>

      <ProcessWorkspace
        process={serialize<ProcessDto>(detail)}
        findings={serialize<FindingDto[]>(findings)}
        analyses={serialize<Record<string, AnalysisDto>>(Object.fromEntries(analysesMap))}
        members={members.map((member) => ({ id: member.user.id, name: member.user.name }))}
        permissions={{
          canRunAnalysis: ctx.can('analysis:run'),
          canUpload: ctx.can('document:upload'),
          canChat: ctx.can('chat:use'),
          canWrite: ctx.can('process:write'),
          canReport: ctx.can('report:generate'),
          canTasks: ctx.can('task:write'),
          canDeadlines: ctx.can('deadline:write'),
        }}
        demoAI={isDemoAI()}
      />
    </PageBody>
  );
}
