import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { permissionsFor } from '@/lib/auth/permissions';
import { AppShell } from '@/components/app-shell/shell';
import { isDemoAI } from '@/lib/env';
import { ensureInlineWorker } from '@/worker/runner';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/entrar');

  // Em deploy single-node o worker vive no mesmo processo; em produção
  // distribuída, QUEUE_INLINE_WORKER=false e `npm run worker` assume.
  ensureInlineWorker();

  return (
    <AppShell
      user={ctx.user}
      organization={ctx.organization}
      role={ctx.role}
      permissions={permissionsFor(ctx.role)}
      demoAI={isDemoAI()}
    >
      {children}
    </AppShell>
  );
}
