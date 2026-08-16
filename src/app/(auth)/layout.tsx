import Link from 'next/link';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">LegalMind AI</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="text-center text-[12px] text-[var(--text-subtle)]">
          Ao continuar você concorda com os{' '}
          <Link href="/legal/termos" className="underline underline-offset-2 hover:text-[var(--text-muted)]">
            termos de uso
          </Link>{' '}
          e a{' '}
          <Link href="/legal/privacidade" className="underline underline-offset-2 hover:text-[var(--text-muted)]">
            política de privacidade
          </Link>
          .
        </p>
      </div>

      {/* Painel lateral: reforça a proposta sem virar propaganda vazia. */}
      <aside className="relative hidden overflow-hidden border-l border-[var(--border)] bg-[var(--bg-subtle)] lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: 'radial-gradient(70% 60% at 80% 20%, var(--accent-soft) 0%, transparent 65%)',
          }}
        />
        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">
            Inteligência estratégica para seus processos
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">
            A IA que lê o processo, encontra onde você pode perder e mostra o que merece sua
            atenção.
          </h2>

          <div className="mt-10 space-y-5">
            {[
              {
                t: 'Cada afirmação tem fonte',
                d: 'Documento, página e trecho. Referência inventada é bloqueada antes de aparecer na tela.',
              },
              {
                t: 'Encontra o argumento contra você',
                d: 'A análise adversarial procura a falha na sua tese antes que a outra parte encontre.',
              },
              {
                t: 'Prioriza em vez de listar',
                d: 'A tela responde uma pergunta: o que precisa da sua atenção agora?',
              },
            ].map((item) => (
              <div key={item.t} className="border-l-2 border-[var(--accent)] pl-4">
                <p className="text-[14px] font-medium">{item.t}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
