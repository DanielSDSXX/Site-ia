import { z } from 'zod';
import { handle, ok, parseJson, parseQuery } from '@/lib/api';
import { requireAuth } from '@/lib/auth/session';
import {
  generateDeadlineNotifications,
  listNotifications,
  markNotificationsRead,
  unreadNotificationCount,
} from '@/server/workspace';

const querySchema = z.object({ unread: z.coerce.boolean().optional() });

export async function GET(request: Request) {
  return handle(request, 'notifications.list', async () => {
    const ctx = await requireAuth();
    const { unread } = parseQuery(request, querySchema);

    // Gera alertas de prazo sob demanda (7/3/1/0 dias), com deduplicação diária.
    await generateDeadlineNotifications(ctx.organization.id).catch(() => 0);

    const [items, unreadCount] = await Promise.all([
      listNotifications(ctx.user.id, unread ?? false),
      unreadNotificationCount(ctx.user.id),
    ]);

    return ok({ items, unreadCount });
  });
}

const readSchema = z.object({ ids: z.array(z.string().max(40)).max(200).optional() });

export async function POST(request: Request) {
  return handle(request, 'notifications.read', async () => {
    const ctx = await requireAuth();
    const { ids } = await parseJson(request, readSchema);
    const count = await markNotificationsRead(ctx.user.id, ids);
    return ok({ marked: count });
  });
}
