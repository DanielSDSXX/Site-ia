'use client';

import { useEffect } from 'react';
import { Logo } from '@/components/logo';

/**
 * Fronteira de erro global.
 *
 * O usuário nunca vê a mensagem técnica (item 62 do briefing). O `digest` é
 * exibido apenas como referência para o suporte correlacionar com o log do
 * servidor, onde o erro completo foi registrado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[legalmind] erro na interface', { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Logo className="size-9" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Não conseguimos concluir esta operação
      </h1>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-[var(--text-muted)]">
        O erro foi registrado internamente. Tente novamente em instantes; se o problema persistir,
        informe o código abaixo ao suporte.
      </p>

      {error.digest && (
        <code className="mt-4 rounded-md bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--text-subtle)]">
          {error.digest}
        </code>
      )}

      <div className="mt-7 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-[14px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-hover)]"
        >
          Tentar novamente
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-[var(--border-strong)] px-4 py-2.5 text-[14px] font-medium transition-colors hover:bg-[var(--bg-subtle)]"
        >
          Voltar ao dashboard
        </a>
      </div>
    </div>
  );
}
