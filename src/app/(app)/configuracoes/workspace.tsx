'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorNotice, InfoNotice } from '@/components/ui';
import { apiDelete, apiPatch, apiPost } from '@/lib/client/api-client';
import { cn, formatDateTime } from '@/lib/utils';
import { MEMORY_KIND_LABELS } from '@/server/memory';
import { IconPlus, IconShield } from '@/components/icons';
import type { AuditRow, MemoryRow } from './page';

type Tab = 'escritorio' | 'plano' | 'ia' | 'memoria' | 'privacidade' | 'auditoria';

const TABS: { key: Tab; label: string }[] = [
  { key: 'escritorio', label: 'Escritório' },
  { key: 'plano', label: 'Plano e uso' },
  { key: 'ia', label: 'IA e infraestrutura' },
  { key: 'memoria', label: 'Memória do escritório' },
  { key: 'privacidade', label: 'Privacidade e dados' },
  { key: 'auditoria', label: 'Auditoria' },
];

interface Props {
  organization: { name: string; slug: string; timezone: string; allowExternalTraining: boolean };
  plan: {
    name: string;
    tier: string;
    status: string;
    maxProcesses: number;
    maxUsers: number;
    maxDocumentsMonth: number;
    maxStorageMb: number;
  };
  usage: {
    processes: number;
    users: number;
    documentsThisMonth: number;
    storageMb: number;
    credits: number;
  };
  credits: number;
  index: { total: number; embedded: number; pending: number; driver: string };
  infrastructure: {
    aiProvider: string;
    aiModel: string;
    embeddingProvider: string;
    demoAI: boolean;
    storage: string;
    encryptionAtRest: boolean;
    ocr: string;
    ocrAvailable: boolean;
    ocrReason: string | null;
    vectorDriver: string;
    payments: string;
    queue: string;
  };
  memory: MemoryRow[];
  auditLogs: AuditRow[];
  permissions: { canEditOrg: boolean; canMemory: boolean; canAudit: boolean };
}

export function SettingsWorkspace(props: Props) {
  const [tab, setTab] = useState<Tab>('escritorio');
  const visibleTabs = TABS.filter(
    (item) =>
      (item.key !== 'auditoria' || props.permissions.canAudit) &&
      (item.key !== 'memoria' || props.permissions.canMemory),
  );

  return (
    <div>
      <div className="overflow-x-auto border-b border-[var(--border)]">
        <nav className="flex min-w-max gap-0.5" role="tablist">
          {visibleTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'relative whitespace-nowrap px-3.5 py-2.5 text-[13.5px] transition-colors',
                tab === item.key
                  ? 'font-medium text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {item.label}
              {tab === item.key && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6 max-w-4xl">
        {tab === 'escritorio' && <OrganizationTab {...props} />}
        {tab === 'plano' && <PlanTab {...props} />}
        {tab === 'ia' && <InfrastructureTab {...props} />}
        {tab === 'memoria' && <MemoryTab {...props} />}
        {tab === 'privacidade' && <PrivacyTab {...props} />}
        {tab === 'auditoria' && <AuditTab {...props} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OrganizationTab({ organization, permissions }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await apiPatch('/api/organization', {
      name: String(form.get('name') ?? ''),
      timezone: String(form.get('timezone') ?? ''),
    });

    setLoading(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Dados do escritório" />
        <form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2">
              <ErrorNotice>{error}</ErrorNotice>
            </div>
          )}
          <div>
            <label className="label" htmlFor="org-name">
              Nome
            </label>
            <input
              id="org-name"
              name="name"
              defaultValue={organization.name}
              className="input"
              disabled={!permissions.canEditOrg}
            />
          </div>
          <div>
            <label className="label" htmlFor="org-timezone">
              Fuso horário
            </label>
            <input
              id="org-timezone"
              name="timezone"
              defaultValue={organization.timezone}
              className="input"
              disabled={!permissions.canEditOrg}
            />
          </div>
          <div>
            <label className="label">Identificador</label>
            <input value={organization.slug} readOnly disabled className="input opacity-60" />
          </div>

          {permissions.canEditOrg && (
            <div className="flex items-end justify-end gap-3 sm:col-span-2">
              {saved && <span className="text-[12.5px] text-[var(--risk-low)]">Alterações salvas.</span>}
              <Button type="submit" variant="primary" loading={loading}>
                Salvar
              </Button>
            </div>
          )}
        </form>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Alterar senha"
        description="Ao trocar a senha, todas as outras sessões ativas são encerradas."
      />
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setDone(false);
          setLoading(true);

          const form = new FormData(event.currentTarget);
          const response = await apiPatch('/api/account', {
            currentPassword: String(form.get('currentPassword') ?? ''),
            newPassword: String(form.get('newPassword') ?? ''),
          });

          setLoading(false);
          if (!response.ok) {
            setError(response.message);
            return;
          }
          setDone(true);
          event.currentTarget.reset();
        }}
      >
        {error && (
          <div className="sm:col-span-2">
            <ErrorNotice>{error}</ErrorNotice>
          </div>
        )}
        <div>
          <label className="label" htmlFor="currentPassword">
            Senha atual
          </label>
          <input id="currentPassword" name="currentPassword" type="password" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="newPassword">
            Nova senha
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={10}
            className="input"
          />
        </div>
        <div className="flex items-end justify-end gap-3 sm:col-span-2">
          {done && <span className="text-[12.5px] text-[var(--risk-low)]">Senha alterada.</span>}
          <Button type="submit" variant="primary" loading={loading}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PlanTab({ plan, usage, credits }: Props) {
  const rows = [
    { label: 'Processos', used: usage.processes, limit: plan.maxProcesses },
    { label: 'Usuários', used: usage.users, limit: plan.maxUsers },
    { label: 'Documentos no mês', used: usage.documentsThisMonth, limit: plan.maxDocumentsMonth },
    { label: 'Armazenamento (MB)', used: usage.storageMb, limit: plan.maxStorageMb },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Plano ${plan.name}`}
          description={`Situação da assinatura: ${plan.status}`}
          action={<Badge tone="accent">{plan.tier}</Badge>}
        />
        <div className="space-y-4 p-5">
          {rows.map((row) => {
            const unlimited = row.limit < 0;
            const percent = unlimited ? 0 : Math.min(100, (row.used / Math.max(row.limit, 1)) * 100);
            return (
              <div key={row.label}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span>{row.label}</span>
                  <span className="text-[var(--text-muted)]">
                    {row.used} / {unlimited ? '∞' : row.limit}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${unlimited ? 3 : percent}%`,
                      background: percent > 90 ? 'var(--risk-critical)' : 'var(--accent)',
                    }}
                  />
                </div>
              </div>
            );
          })}

          <div className="border-t border-[var(--border)] pt-4">
            <div className="flex items-baseline justify-between text-[13px]">
              <span>Créditos de IA disponíveis</span>
              <span className="text-[18px] font-semibold">{credits}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
              Cada operação consome créditos conforme seu custo: chat 1, resumo 3, mapa de provas 4,
              vulnerabilidades e simulações 5. Embeddings não consomem crédito.
            </p>
          </div>
        </div>
      </Card>

      <InfoNotice>
        <strong>Cobrança automática é uma integração futura.</strong> O modelo de assinatura, planos
        e limites está implementado e operante, mas nenhum provedor de pagamento está conectado nesta
        instalação (<code className="font-mono">PAYMENT_PROVIDER=none</code>). Não há cobrança
        processada, e nenhum dado de cartão é armazenado pela plataforma em nenhuma hipótese — a
        integração prevista delega isso inteiramente ao provedor (Stripe ou Mercado Pago).
      </InfoNotice>
    </div>
  );
}

// ---------------------------------------------------------------------------

function InfrastructureTab({ infrastructure, index }: Props) {
  const rows = [
    {
      label: 'Provedor de IA',
      value: infrastructure.demoAI
        ? `${infrastructure.aiProvider} (sem LLM conectado)`
        : `${infrastructure.aiProvider} · ${infrastructure.aiModel}`,
      tone: infrastructure.demoAI ? 'warning' : 'success',
    },
    { label: 'Provedor de embeddings', value: infrastructure.embeddingProvider, tone: 'neutral' },
    { label: 'Busca vetorial', value: infrastructure.vectorDriver, tone: 'neutral' },
    { label: 'Armazenamento', value: infrastructure.storage, tone: 'neutral' },
    {
      label: 'Criptografia em repouso',
      value: infrastructure.encryptionAtRest ? 'ativa (AES-256-GCM)' : 'desativada',
      tone: infrastructure.encryptionAtRest ? 'success' : 'warning',
    },
    {
      label: 'OCR',
      value: infrastructure.ocrAvailable
        ? `${infrastructure.ocr} (disponível)`
        : `${infrastructure.ocr}${infrastructure.ocrReason ? ` — ${infrastructure.ocrReason}` : ''}`,
      tone: infrastructure.ocrAvailable ? 'success' : 'warning',
    },
    { label: 'Fila de processamento', value: infrastructure.queue, tone: 'neutral' },
    { label: 'Pagamentos', value: infrastructure.payments, tone: 'neutral' },
  ] as const;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Configuração ativa"
          description="O que está efetivamente ligado nesta instalação. Alterado por variáveis de ambiente."
        />
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-[13.5px]">{row.label}</span>
              <Badge tone={row.tone}>{row.value}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Índice de busca"
          description="Trechos indexados para recuperação semântica e full-text."
        />
        <div className="grid grid-cols-3 gap-4 p-5 text-center">
          <div>
            <p className="text-[22px] font-semibold">{index.total}</p>
            <p className="text-[11.5px] text-[var(--text-muted)]">trechos</p>
          </div>
          <div>
            <p className="text-[22px] font-semibold text-[var(--risk-low)]">{index.embedded}</p>
            <p className="text-[11.5px] text-[var(--text-muted)]">com embedding</p>
          </div>
          <div>
            <p className="text-[22px] font-semibold text-[var(--risk-medium)]">{index.pending}</p>
            <p className="text-[11.5px] text-[var(--text-muted)]">pendentes</p>
          </div>
        </div>
      </Card>

      {infrastructure.demoAI && (
        <InfoNotice>
          Sem um modelo de linguagem conectado, a plataforma continua operando por verificação
          estrutural determinística: extração de datas e valores, detecção de alegações sem lastro
          documental, comparação numérica entre peças e recuperação lexical de trechos. Isso é
          genuinamente útil — e é rotulado como &ldquo;modo demonstração&rdquo; em toda a interface,
          porque não equivale à leitura semântica de um LLM.
        </InfoNotice>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MemoryTab({ memory, permissions }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Memória do escritório"
          description="Conhecimento interno que a plataforma pode usar como referência de estilo e estratégia."
          action={
            permissions.canMemory && (
              <Button size="sm" onClick={() => setShowForm((value) => !value)}>
                <IconPlus className="size-3.5" />
                Novo item
              </Button>
            )
          }
        />

        <div className="p-5">
          <InfoNotice>
            Estes itens <strong>nunca</strong> são tratados como prova de um processo nem como
            jurisprudência verificada. O prompt que os injeta diz isso explicitamente ao modelo. O
            conteúdo é isolado por escritório e jamais recuperado por outra organização.
          </InfoNotice>
        </div>

        {error && (
          <div className="px-5 pb-4">
            <ErrorNotice>{error}</ErrorNotice>
          </div>
        )}

        {showForm && permissions.canMemory && (
          <form
            className="grid gap-4 border-t border-[var(--border)] p-5 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              const form = new FormData(event.currentTarget);
              const response = await apiPost('/api/memory', {
                kind: String(form.get('kind') ?? 'INTERNAL_KNOWLEDGE'),
                title: String(form.get('title') ?? ''),
                content: String(form.get('content') ?? ''),
                tags: String(form.get('tags') ?? '')
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              });
              if (!response.ok) {
                setError(response.message);
                return;
              }
              setShowForm(false);
              router.refresh();
            }}
          >
            <div>
              <label className="label" htmlFor="memory-kind">
                Tipo
              </label>
              <select id="memory-kind" name="kind" className="input">
                {Object.entries(MEMORY_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="memory-title">
                Título
              </label>
              <input id="memory-title" name="title" required className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="memory-content">
                Conteúdo
              </label>
              <textarea
                id="memory-content"
                name="content"
                required
                rows={6}
                className="input resize-y"
                placeholder="Tese, modelo de peça, estratégia recorrente, padrão de linguagem do escritório…"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="memory-tags">
                Tags (separadas por vírgula)
              </label>
              <input id="memory-tags" name="tags" className="input" placeholder="consumidor, dano moral" />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Salvar e indexar
              </Button>
            </div>
          </form>
        )}

        {memory.length === 0 ? (
          <p className="border-t border-[var(--border)] px-5 py-8 text-center text-[13px] text-[var(--text-subtle)]">
            Nenhum item cadastrado. Sem memória, o chat responde apenas com base nos documentos do
            processo.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {memory.map((item) => (
              <li key={item.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{MEMORY_KIND_LABELS[item.kind] ?? item.kind}</Badge>
                      <span className="text-[13.5px] font-medium">{item.title}</span>
                      {!item.enabled && <Badge tone="warning">Desativado</Badge>}
                      {!item.embeddingModel && <Badge tone="warning">Sem embedding</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                      {item.content}
                    </p>
                    {item.tags.length > 0 && (
                      <p className="mt-1 text-[11.5px] text-[var(--text-subtle)]">
                        {item.tags.join(' · ')}
                      </p>
                    )}
                  </div>

                  {permissions.canMemory && (
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiPatch('/api/memory', { id: item.id, enabled: !item.enabled });
                          router.refresh();
                        }}
                        className="rounded px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                      >
                        {item.enabled ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Excluir "${item.title}"?`)) return;
                          await apiDelete(`/api/memory?id=${item.id}`);
                          router.refresh();
                        }}
                        className="rounded px-2 py-1 text-[12px] text-[var(--text-subtle)] hover:text-[var(--risk-critical)]"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PrivacyTab({ organization, permissions }: Props) {
  const router = useRouter();
  const [training, setTraining] = useState(organization.allowExternalTraining);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Privacidade da IA"
          icon={<IconShield className="size-4.5" />}
          description="Como os documentos do escritório podem ser usados por provedores externos."
        />
        <div className="p-5">
          {error && (
            <div className="mb-4">
              <ErrorNotice>{error}</ErrorNotice>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={!training}
              disabled={!permissions.canEditOrg}
              onChange={async (event) => {
                const next = !event.target.checked;
                setTraining(next);
                const response = await apiPatch('/api/organization', { allowExternalTraining: next });
                if (!response.ok) {
                  setError(response.message);
                  setTraining(!next);
                  return;
                }
                router.refresh();
              }}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span>
              <span className="text-[14px] font-medium">
                Seus documentos não serão utilizados para treinamento de modelos externos
              </span>
              <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                Esta configuração expressa a instrução do escritório enquanto controlador dos dados.
                O cumprimento efetivo depende dos termos contratuais com o provedor de IA
                configurado — verifique a política de retenção e treinamento dele. Quando o provedor
                local está ativo, nada sai desta instalação.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Seus dados"
          description="Direitos previstos nos incisos V e VI do art. 18 da LGPD."
        />
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium">Exportar meus dados</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                Baixa um JSON com seu cadastro, os processos do escritório, os documentos que você
                enviou, suas tarefas, prazos e registros de auditoria.
              </p>
            </div>
            <a
              href="/api/account"
              className="shrink-0 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--bg-subtle)]"
            >
              Exportar
            </a>
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-[var(--border)] pt-4">
            <div>
              <p className="text-[14px] font-medium" style={{ color: 'var(--risk-critical)' }}>
                Excluir minha conta
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                Anonimiza seu cadastro e encerra todas as sessões. Se você for o único proprietário
                deste escritório, o escritório também será encerrado. A ação é irreversível.
              </p>
            </div>
            <Button
              variant="danger"
              className="shrink-0"
              onClick={async () => {
                if (
                  !confirm(
                    'Excluir sua conta definitivamente? Esta ação não pode ser desfeita.',
                  )
                ) {
                  return;
                }
                const response = await apiDelete('/api/account');
                if (!response.ok) {
                  setError(response.message);
                  return;
                }
                window.location.href = '/';
              }}
            >
              Excluir conta
            </Button>
          </div>
        </div>
      </Card>

      <InfoNotice>
        As medidas técnicas de proteção estão descritas na{' '}
        <a href="/legal/privacidade" className="text-[var(--accent)] underline underline-offset-2">
          política de privacidade
        </a>
        . Nenhuma plataforma pode se declarar &ldquo;100% adequada à LGPD&rdquo; sem auditoria
        especializada: a adequação completa depende também das políticas internas do escritório e
        dos contratos com operadores.
      </InfoNotice>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AuditTab({ auditLogs }: Props) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Trilha de auditoria"
        description="Últimos 50 eventos registrados. Endereços IP são armazenados apenas em forma pseudonimizada."
      />
      {auditLogs.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-[var(--text-subtle)]">
          Nenhum evento registrado ainda.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {auditLogs.map((log) => (
            <li key={log.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px]">{log.label}</p>
                <p className="text-[11.5px] text-[var(--text-subtle)]">
                  {log.userName ?? 'Sistema'}
                  {log.resourceType ? ` · ${log.resourceType}` : ''}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11.5px] text-[var(--text-subtle)]">
                {formatDateTime(log.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
