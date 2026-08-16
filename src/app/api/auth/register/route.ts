import { headers } from 'next/headers';
import { created, handle, parseJson, rateLimitIdentity } from '@/lib/api';
import { registerSchema } from '@/lib/validation';
import { registerAccount } from '@/server/accounts';
import { createSession, clientIpFromHeaders } from '@/lib/auth/session';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { hashIp } from '@/lib/security/crypto';
import { audit } from '@/lib/audit';

export async function POST(request: Request) {
  return handle(request, 'auth.register', async () => {
    await enforceRateLimit(RATE_LIMITS.register, await rateLimitIdentity());

    const input = await parseJson(request, registerSchema);
    const { user, organization } = await registerAccount(input);
    await createSession(user.id, organization.id);

    const hdrs = await headers();
    await audit({
      action: 'auth.register',
      userId: user.id,
      organizationId: organization.id,
      resourceType: 'user',
      resourceId: user.id,
      ipHash: hashIp(clientIpFromHeaders(hdrs)),
      userAgent: hdrs.get('user-agent'),
    });

    return created({
      user: { id: user.id, name: user.name, email: user.email },
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
    });
  });
}
