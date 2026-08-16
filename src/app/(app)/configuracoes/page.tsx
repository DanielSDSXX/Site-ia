import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth/session';
import { quotaSnapshot } from '@/server/quota';
import { indexStats } from '@/lib/rag/vector-store';
import { listMemoryItems } from '@/server/memory';
import { creditBalance } from '@/lib/ai/usage';
import { serialize } from '@/server/serialize';
import { env, isDemoAI } from '@/lib/env';
import { isEncryptionEnabled } from '@/lib/security/crypto';
import { ocrAvailable } from '@/lib/documents/ocr';
import { PageBody, PageHeader } from '@/components/page-header';
import { SettingsWorkspace } from './workspace';
import { AUDIT_LABELS } from '@/lib/audit';

export const metadata: Metadata = { title: 'Configurações' };
export const dynamic = 'force-dynamic';

export interface MemoryRow {
  id: string;
  kind: string;
  title: string;
  content: string;
  tags: string[];
  enabled: boolean;
  embeddingModel: string | null;
  updatedAt: string;
}

export interface AuditRow {
  id: string;
  action: string;
  label: string;
  resourceType: string | null;
  createdAt: string;
  userName: string | null;
}

export default async function SettingsPage() {
  const ctx = await requireAuth();

  const [organization, quota, index, memory, credits, auditLogs, ocr] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organization.id },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        allowExternalTraining: true,
        createdAt: true,
        subscription: { include: { plan: true } },
      },
    }),
    quotaSnapshot(ctx.organization.id),
    indexStats(ctx.organization.id),
    ctx.can('memory:read') ? listMemoryItems(ctx.organization.id) : Promise.resolve([]),
    creditBalance(ctx.organization.id),
    ctx.can('audit:read')
      ? prisma.auditLog.findMany({
          where: { organizationId: ctx.organization.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            action: true,
            resourceType: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    ocrAvailable(),
  ]);

  return (
    <PageBody>
      <PageHeader
        title="Configurações"
        description={`${organization?.name ?? ctx.organization.name} · criado em ${
          organization ? new Date(organization.createdAt).toLocaleDateString('pt-BR') : '—'
        }`}
      />

      <div className="mt-6">
        <SettingsWorkspace
          organization={{
            name: organization?.name ?? ctx.organization.name,
            slug: organization?.slug ?? ctx.organization.slug,
            timezone: organization?.timezone ?? 'America/Sao_Paulo',
            allowExternalTraining: organization?.allowExternalTraining ?? false,
          }}
          plan={{
            name: organization?.subscription?.plan.name ?? 'Free',
            tier: organization?.subscription?.plan.tier ?? 'FREE',
            status: organization?.subscription?.status ?? 'TRIALING',
            maxProcesses: quota.plan.maxProcesses,
            maxUsers: quota.plan.maxUsers,
            maxDocumentsMonth: quota.plan.maxDocumentsMonth,
            maxStorageMb: quota.plan.maxStorageMb,
          }}
          usage={quota.usage}
          credits={credits}
          index={index}
          infrastructure={{
            aiProvider: env().AI_PROVIDER,
            aiModel: env().AI_MODEL ?? 'padrão do provedor',
            embeddingProvider: env().EMBEDDING_PROVIDER,
            demoAI: isDemoAI(),
            storage: env().STORAGE_DRIVER,
            encryptionAtRest: isEncryptionEnabled(),
            ocr: env().OCR_PROVIDER,
            ocrAvailable: ocr.available,
            ocrReason: ocr.reason ?? null,
            vectorDriver: env().VECTOR_DRIVER,
            payments: env().PAYMENT_PROVIDER,
            queue: env().QUEUE_DRIVER,
          }}
          memory={serialize<MemoryRow[]>(memory)}
          auditLogs={auditLogs.map((log) => ({
            id: log.id,
            action: log.action,
            label: AUDIT_LABELS[log.action] ?? log.action,
            resourceType: log.resourceType,
            createdAt: log.createdAt.toISOString(),
            userName: log.user?.name ?? null,
          }))}
          permissions={{
            canEditOrg: ctx.can('org:settings'),
            canMemory: ctx.can('memory:write'),
            canAudit: ctx.can('audit:read'),
          }}
        />
      </div>
    </PageBody>
  );
}
