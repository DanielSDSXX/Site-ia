import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/ui';
import {
  IconAlert,
  IconArrowRight,
  IconBrain,
  IconShield,
  IconSwords,
  IconTarget,
} from '@/components/icons';

export const metadata: Metadata = {
  title: 'LegalMind AI — Entenda seu processo antes que ele exija sua atenção',
  description:
    'Uma plataforma de inteligência jurídica que transforma processos complexos em riscos, evidências, estratégias e próximas ações.',
};

export default function LandingPage() {
  return (
    <main>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.55]"
          style={{
            background:
              'radial-gradient(60% 100% at 50% 0%, var(--accent-soft) 0%, transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-20 md:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[12.5px] text-[var(--text-muted)]">
              <span className="size-1.5 rounded-full bg-[var(--accent)]" />
              Sistema operacional de inteligência jurídica
            </span>

            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em] md:text-6xl">
              Entenda seu processo antes que ele exija sua atenção.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-[17px] leading-relaxed text-[var(--text-muted)]">
              Uma plataforma de inteligência jurídica que transforma processos complexos em riscos,
              evidências, estratégias e próximas ações.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <LinkButton href="/criar-conta" variant="primary" size="lg">
                Começar gratuitamente
                <IconArrowRight className="size-4" />
              </LinkButton>
              <LinkButton href="#como-funciona" variant="secondary" size="lg">
                Ver como funciona
              </LinkButton>
            </div>

            <p className="mt-4 text-[12.5px] text-[var(--text-subtle)]">
              Plano gratuito com 2 processos. Sem cartão de crédito.
            </p>
          </div>

          {/* Prévia da tela do processo */}
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="card overflow-hidden p-0">
              <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-[var(--border-strong)]" />
                <span className="size-2.5 rounded-full bg-[var(--border-strong)]" />
                <span className="size-2.5 rounded-full bg-[var(--border-strong)]" />
                <span className="ml-3 font-mono text-[11.5px] text-[var(--text-subtle)]">
                  Processo 0000000-00.0000.0.00.0000 · exemplo ilustrativo
                </span>
              </div>

              <div className="grid gap-px bg-[var(--border)] md:grid-cols-3">
                <PreviewPanel
                  label="Situação atual"
                  tone="neutral"
                  body="Contestação apresentada com preliminar de ilegitimidade passiva. Réplica ainda não protocolada."
                />
                <PreviewPanel
                  label="Onde você pode perder"
                  tone="critical"
                  body="A alegação de cobrança indevida não tem comprovante correspondente entre os documentos indexados."
                  cite="Petição inicial · p. 7"
                />
                <PreviewPanel
                  label="Próxima ação"
                  tone="accent"
                  body="Reunir o extrato do período antes da réplica; a defesa já apontou a ausência dessa prova."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-4 py-3 text-[11.5px] text-[var(--text-subtle)]">
                <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-1">
                  Toda afirmação leva ao documento e à página
                </span>
                <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-1">
                  Sem previsão de sentença
                </span>
                <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-1">
                  Sem jurisprudência inventada
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Problema */}
      <section id="problema" className="border-t border-[var(--border)] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">
                O problema
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
                Processos são longos. A informação está espalhada.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-muted)]">
                O que decide um caso costuma já estar nos autos — numa página que ninguém releu, num
                valor que não bate com o da outra peça, numa alegação que nunca foi provada. O
                gargalo do advogado raramente é escrever. É encontrar.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Prazos passam porque ninguém olhou o processo certo no dia certo.',
                  'Documentos importantes ficam enterrados em centenas de páginas.',
                  'A parte contrária encontra a falha antes de você.',
                  'Cada revisão de caso recomeça a leitura do zero.',
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-[14.5px] text-[var(--text-muted)]">
                    <IconAlert className="mt-0.5 size-4 shrink-0 text-[var(--risk-high)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">
                A solução
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
                Documento → Inteligência → Estratégia → Ação.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-muted)]">
                A plataforma lê o processo inteiro, estrutura o que está lá dentro e devolve o que
                exige decisão: onde estão os riscos, quais provas faltam, o que a outra parte vai
                atacar e o que fazer agora.
              </p>

              <div className="mt-6 space-y-px overflow-hidden rounded-xl border border-[var(--border)]">
                {[
                  { step: 'Documento', text: 'PDF, DOCX, digitalizado. Página a página.' },
                  { step: 'Inteligência', text: 'Partes, fatos, provas, teses, contradições.' },
                  { step: 'Estratégia', text: 'Vulnerabilidades, adversário, cenários.' },
                  { step: 'Ação', text: 'O que merece sua atenção hoje.' },
                ].map((row, index) => (
                  <div
                    key={row.step}
                    className="flex items-baseline gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 last:border-b-0"
                  >
                    <span className="font-mono text-[11px] text-[var(--text-subtle)]">
                      0{index + 1}
                    </span>
                    <span className="w-28 shrink-0 text-[14px] font-medium">{row.step}</span>
                    <span className="text-[13.5px] text-[var(--text-muted)]">{row.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Inteligências */}
      <section id="inteligencia" className="border-t border-[var(--border)] bg-[var(--bg-subtle)] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">
              Três inteligências
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
              Não escrevemos apenas documentos. Entendemos o processo.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <FeatureCard
              icon={<IconBrain className="size-5" />}
              title="Inteligência do processo"
              text="Lê cada página, identifica partes, fatos, pedidos e provas, e liga cada afirmação ao trecho exato que a sustenta."
              points={['Linha do tempo automática', 'Mapa de provas', 'Chat com citação por página']}
            />
            <FeatureCard
              icon={<IconSwords className="size-5" />}
              title="Inteligência adversarial"
              text="Assume a posição da parte contrária e procura ativamente onde a sua tese quebra — antes que alguém faça isso por você."
              points={['Encontrar vulnerabilidades', 'Simular adversário', 'Detector de contradições']}
            />
            <FeatureCard
              icon={<IconTarget className="size-5" />}
              title="Inteligência estratégica"
              text="Transforma o diagnóstico em prioridade: o que merece atenção hoje, com a razão de ser agora."
              points={['Próxima ação', 'Simulação analítica', 'Relatórios para cliente e equipe']}
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Como funciona */}
      <section id="como-funciona" className="border-t border-[var(--border)] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Como funciona</h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
            Do upload à decisão. Você continua no comando em cada etapa.
          </p>

          <ol className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-3">
            {[
              { n: 1, t: 'Carregue o processo', d: 'Arraste os PDFs. O processamento roda em segundo plano — a tela não trava.' },
              { n: 2, t: 'A plataforma estrutura os documentos', d: 'Texto por página, classificação das peças, índice semântico e full-text.' },
              { n: 3, t: 'Encontre riscos e contradições', d: 'Alegações sem prova, valores que não batem, datas incompatíveis entre peças.' },
              { n: 4, t: 'Simule os argumentos adversários', d: 'O que a outra parte vai sustentar e como isso pode ser enfrentado.' },
              { n: 5, t: 'Descubra o que merece atenção', d: 'Prioridades ordenadas por impacto real, não por ordem de cadastro.' },
              { n: 6, t: 'Tome a decisão profissional', d: 'A plataforma não pratica atos. Ela prepara o terreno para você decidir.' },
            ].map((step) => (
              <li key={step.n}>
                <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] font-mono text-[13px] font-semibold text-[var(--accent)]">
                  {step.n}
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{step.t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-muted)]">{step.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------ Confiança */}
      <section className="border-t border-[var(--border)] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="card p-8 md:p-10">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <IconShield className="size-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  O que esta plataforma se recusa a fazer
                </h2>
                <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[var(--text-muted)]">
                  Confiança em software jurídico se constrói pelo que ele não faz. Estas regras são
                  aplicadas em código, não são promessa de marketing.
                </p>
              </div>
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  t: 'Não inventa documento',
                  d: 'Cada citação é verificada contra o trecho real indexado. Referência inexistente é descartada antes de chegar à tela.',
                },
                {
                  t: 'Não prevê sentença',
                  d: 'Nenhuma análise afirma quem ganha. A simulação organiza o material decisório e aponta o que está controvertido.',
                },
                {
                  t: 'Não cria jurisprudência',
                  d: 'O acervo só aceita decisões importadas com fonte oficial. Nada é apresentado como julgado sem link verificável.',
                },
                {
                  t: 'Não finge ter IA',
                  d: 'Sem um modelo conectado, o produto continua funcionando por verificação estrutural — e diz isso em toda tela.',
                },
              ].map((item) => (
                <div key={item.t} className="rounded-xl bg-[var(--bg-subtle)] p-5">
                  <p className="text-[14px] font-semibold">{item.t}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{item.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Planos */}
      <section id="planos" className="border-t border-[var(--border)] bg-[var(--bg-subtle)] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-semibold tracking-tight">Planos</h2>
          <p className="mt-3 text-[15px] text-[var(--text-muted)]">
            Comece grátis. Cresça quando o volume exigir.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                name: 'Free',
                price: 'R$ 0',
                note: 'para experimentar com um caso real',
                features: ['1 usuário', '2 processos', '20 documentos/mês', 'Análises básicas', 'Chat com citações'],
              },
              {
                name: 'Pro',
                price: 'R$ 199',
                note: 'por mês',
                highlight: true,
                features: [
                  '3 usuários',
                  '50 processos',
                  'Todas as inteligências',
                  'Relatórios PDF e DOCX',
                  'Prazos e tarefas',
                ],
              },
              {
                name: 'Business',
                price: 'R$ 599',
                note: 'por mês',
                features: [
                  '15 usuários',
                  '500 processos',
                  'Memória do Escritório',
                  'Acervo de jurisprudência',
                  'Trilha de auditoria',
                ],
              },
              {
                name: 'Enterprise',
                price: 'Sob consulta',
                note: 'volume elevado e customização',
                features: [
                  'Usuários ilimitados',
                  'Provedor de IA dedicado',
                  'SSO e retenção customizada',
                  'Suporte prioritário',
                ],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`card flex flex-col p-6 ${plan.highlight ? 'ring-1 ring-[var(--accent)]' : ''}`}
              >
                {plan.highlight && (
                  <span className="mb-3 w-fit rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                    Mais escolhido
                  </span>
                )}
                <h3 className="text-[15px] font-semibold">{plan.name}</h3>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{plan.price}</p>
                <p className="mt-1 text-[12.5px] text-[var(--text-subtle)]">{plan.note}</p>
                <ul className="mt-5 flex-1 space-y-2.5 text-[13.5px] text-[var(--text-muted)]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--accent)]" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <LinkButton
                  href="/criar-conta"
                  variant={plan.highlight ? 'primary' : 'secondary'}
                  size="sm"
                  className="mt-6 w-full"
                >
                  {plan.name === 'Enterprise' ? 'Falar com o time' : 'Começar'}
                </LinkButton>
              </div>
            ))}
          </div>

          <p className="mt-6 text-[12.5px] text-[var(--text-subtle)]">
            A cobrança automática é uma integração planejada. Na configuração padrão desta
            instalação, planos e limites funcionam, mas nenhuma cobrança é processada — veja{' '}
            <code className="font-mono">PAYMENT_PROVIDER</code> na documentação.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="border-t border-[var(--border)] py-24">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em]">
            Menos tempo procurando. Mais tempo decidindo.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-[var(--text-muted)]">
            A IA que lê o processo, encontra onde você pode perder e mostra o que merece sua
            atenção.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton href="/criar-conta" variant="primary" size="lg">
              Criar minha conta
              <IconArrowRight className="size-4" />
            </LinkButton>
            <Link
              href="/entrar"
              className="text-[14px] text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function PreviewPanel({
  label,
  body,
  cite,
  tone,
}: {
  label: string;
  body: string;
  cite?: string;
  tone: 'neutral' | 'critical' | 'accent';
}) {
  const color =
    tone === 'critical' ? 'var(--risk-critical)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-subtle)';

  return (
    <div className="bg-[var(--surface)] p-5">
      <p
        className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
        style={{ color }}
      >
        {label}
      </p>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--text)]">{body}</p>
      {cite && (
        <p className="mt-3 inline-flex rounded-md bg-[var(--bg-subtle)] px-2 py-1 font-mono text-[11px] text-[var(--text-subtle)]">
          {cite}
        </p>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
  points,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  points: string[];
}) {
  return (
    <div className="card p-6">
      <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </div>
      <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--text-muted)]">{text}</p>
      <ul className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-[13px] text-[var(--text-muted)]">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--accent)]" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
