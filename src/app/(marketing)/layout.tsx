import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { LinkButton } from '@/components/ui';
import { Logo } from '@/components/logo';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">LegalMind AI</span>
          </Link>

          <nav className="hidden items-center gap-7 text-[13.5px] text-[var(--text-muted)] md:flex">
            <a href="#problema" className="transition-colors hover:text-[var(--text)]">
              O problema
            </a>
            <a href="#como-funciona" className="transition-colors hover:text-[var(--text)]">
              Como funciona
            </a>
            <a href="#inteligencia" className="transition-colors hover:text-[var(--text)]">
              Inteligências
            </a>
            <a href="#planos" className="transition-colors hover:text-[var(--text)]">
              Planos
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/entrar"
              className="hidden rounded-lg px-3 py-2 text-[13.5px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] sm:block"
            >
              Entrar
            </Link>
            <LinkButton href="/criar-conta" variant="primary" size="sm">
              Começar gratuitamente
            </LinkButton>
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-[var(--border)] py-12">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col justify-between gap-8 md:flex-row">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <Logo className="size-6" />
                <span className="text-sm font-semibold">LegalMind AI</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
                Inteligência estratégica para seus processos. A decisão profissional continua sendo
                do advogado.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10 text-[13px] sm:grid-cols-3">
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Produto
                </p>
                <ul className="space-y-2 text-[var(--text-muted)]">
                  <li>
                    <a href="#como-funciona" className="hover:text-[var(--text)]">
                      Como funciona
                    </a>
                  </li>
                  <li>
                    <a href="#inteligencia" className="hover:text-[var(--text)]">
                      Inteligências
                    </a>
                  </li>
                  <li>
                    <a href="#planos" className="hover:text-[var(--text)]">
                      Planos
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Legal
                </p>
                <ul className="space-y-2 text-[var(--text-muted)]">
                  <li>
                    <Link href="/legal/termos" className="hover:text-[var(--text)]">
                      Termos de uso
                    </Link>
                  </li>
                  <li>
                    <Link href="/legal/privacidade" className="hover:text-[var(--text)]">
                      Política de privacidade
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Conta
                </p>
                <ul className="space-y-2 text-[var(--text-muted)]">
                  <li>
                    <Link href="/entrar" className="hover:text-[var(--text)]">
                      Entrar
                    </Link>
                  </li>
                  <li>
                    <Link href="/criar-conta" className="hover:text-[var(--text)]">
                      Criar conta
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <p className="mt-10 border-t border-[var(--border)] pt-6 text-[12px] leading-relaxed text-[var(--text-subtle)]">
            O LegalMind AI é uma ferramenta de apoio à decisão. Suas análises são de natureza
            estratégica e probabilística, não constituem parecer jurídico e não substituem a
            avaliação do advogado responsável. A plataforma não prevê o resultado de julgamentos.
          </p>
        </div>
      </footer>
    </div>
  );
}
