import { prisma } from '@/lib/db';
import { handle, ok } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(request, 'processes.timeline', async () => {
    const ctx = await requirePermission('process:read');
    const { id } = await params;

    const events = await prisma.timelineEvent.findMany({
      where: { organizationId: ctx.organization.id, processId: id },
      orderBy: { occurredAt: 'asc' },
      include: { document: { select: { id: true, title: true } } },
    });

    return ok({ events });
  });
}
