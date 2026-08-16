import { prisma } from '@/lib/db';
import { handle, ok, parseJson } from '@/lib/api';
import { requireAuth, requirePermission } from '@/lib/auth/session';
import { orgSettingsSchema } from '@/lib/validation';
import { quotaSnapshot } from '@/server/quota';
import { indexStats } from '@/lib/rag/vector-store';
import { env, isDemoAI } from '@/lib/env';
import { audit } from '@/lib/audit';

export async function GET(request: Request) {
  return handle(request, 'organization.get', async () => {
    const ctx = await requireAuth();

    const [organization, quota, index] = await Promise.all([
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
    ]);

    return ok({
      organization,
      quota,
      index,
      ai: {
        provider: env().AI_PROVIDER,
        embeddingProvider: env().EMBEDDING_PROVIDER,
        demo: isDemoAI(),
        ocr: env().OCR_PROVIDER,
        storage: env().STORAGE_DRIVER,
        payments: env().PAYMENT_PROVIDER,
      },
    });
  });
}

export async function PATCH(request: Request) {
  return handle(request, 'organization.update', async () => {
    const ctx = await requirePermission('org:settings');
    const input = await parseJson(request, orgSettingsSchema);

    await prisma.organization.update({ where: { id: ctx.organization.id }, data: input });

    await audit({
      action: 'org.update',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      metadata: { fields: Object.keys(input) },
    });

    return ok({ ok: true });
  });
}
