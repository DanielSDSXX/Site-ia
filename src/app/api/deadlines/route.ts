import { z } from 'zod';
import { created, handle, ok, parseJson, parseQuery } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { deadlineSchema } from '@/lib/validation';
import { createDeadline, listDeadlines, reconcileOverdueDeadlines } from '@/server/workspace';
import { computeDeadline } from '@/lib/deadlines/calculator';
import { audit } from '@/lib/audit';

const querySchema = z.object({
  status: z.enum(['OPEN', 'DONE', 'MISSED', 'CANCELED']).optional(),
  processId: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function GET(request: Request) {
  return handle(request, 'deadlines.list', async () => {
    const ctx = await requirePermission('deadline:read');
    const filters = parseQuery(request, querySchema);
    await reconcileOverdueDeadlines(ctx.organization.id);
    return ok({ items: await listDeadlines(ctx.organization.id, filters) });
  });
}

export async function POST(request: Request) {
  return handle(request, 'deadlines.create', async () => {
    const ctx = await requirePermission('deadline:write');
    const input = await parseJson(request, deadlineSchema);
    const deadline = await createDeadline(ctx.organization.id, input);

    await audit({
      action: 'deadline.create',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'deadline',
      resourceId: deadline.id,
      metadata: { computed: deadline.computed },
    });

    return created({
      id: deadline.id,
      dueDate: deadline.dueDate,
      computed: deadline.computed,
      computationNote: deadline.computationNote,
    });
  });
}

const previewSchema = z.object({
  baseDate: z.coerce.date(),
  days: z.coerce.number().int().min(1).max(365),
  countingMode: z.enum(['BUSINESS_DAYS', 'CALENDAR_DAYS']).default('BUSINESS_DAYS'),
});

/** Pré-visualização do cálculo, sem gravar nada. */
export async function PUT(request: Request) {
  return handle(request, 'deadlines.preview', async () => {
    await requirePermission('deadline:read');
    const input = await parseJson(request, previewSchema);
    const result = computeDeadline(input);
    return ok(result);
  });
}
