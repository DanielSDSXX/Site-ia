import { handle, ok, parseJson, rateLimitIdentity } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { chatSchema } from '@/lib/validation';
import { askProcess, listThreads } from '@/lib/intelligence/chat';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { assertCreditBalance } from '@/server/quota';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return handle(request, 'chat.threads', async () => {
    const ctx = await requirePermission('chat:use');
    const { id } = await params;
    return ok({ threads: await listThreads(ctx.organization.id, id, ctx.user.id) });
  });
}

export async function POST(request: Request, { params }: Params) {
  return handle(request, 'chat.ask', async () => {
    const ctx = await requirePermission('chat:use');
    const { id } = await params;

    await enforceRateLimit(RATE_LIMITS.chat, await rateLimitIdentity(ctx.user.id));
    await assertCreditBalance(ctx.organization.id);

    const input = await parseJson(request, chatSchema);
    const response = await askProcess({
      organizationId: ctx.organization.id,
      processId: id,
      userId: ctx.user.id,
      threadId: input.threadId,
      question: input.question,
      verbosity: input.verbosity,
      useOrgMemory: input.useOrgMemory,
    });

    await audit({
      action: 'chat.message',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'process',
      resourceId: id,
      metadata: { threadId: response.threadId },
    });

    return ok(response);
  });
}
