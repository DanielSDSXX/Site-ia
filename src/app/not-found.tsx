import Link from 'next/link';
import { Logo } from '@/components/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Logo className="size-9" />
      <p className="mt-6 font-mono text-[12px] tracking-widest text-[var(--text-subtle)]">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--text-muted)]">
        O endereço não existe ou o registro foi removido. Se você chegou aqui por um link interno,
        talvez o processo tenha sido arquivado.
      </p>
      <div className="mt-7 flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[14px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          Ir para o dashboard
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-[var(--border-strong)] px-4 py-2.5 text-[14px] font-medium transition-colors hover:bg-[var(--bg-subtle)]"
        >
          Página inicial
        </Link>
      </div>
    </div>
  );
}
