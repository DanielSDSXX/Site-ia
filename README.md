# LegalMind AI

**Inteligência estratégica para seus processos.**

Plataforma SaaS de inteligência jurídica que transforma processos complexos em riscos,
evidências, estratégias e próximas ações.

> A IA que lê o processo, encontra onde você pode perder e mostra o que merece sua atenção.

---

## O que este produto é

Não é um gerador de petições nem um chatbot jurídico. O coração do produto é responder,
a partir dos autos que o próprio advogado enviou:

- o que aconteceu e o que está acontecendo agora;
- onde a nossa posição é frágil e por quê;
- quais alegações ainda não têm prova nos autos;
- onde há contradições entre as peças;
- o que a parte contrária provavelmente vai sustentar;
- **o que precisa ser feito agora.**

Três inteligências sustentam isso:

| Inteligência | O que faz |
| --- | --- |
| **Do processo** | Lê cada página, extrai partes, fatos, pedidos e provas, e ancora tudo no trecho de origem. |
| **Adversarial** | Assume a posição da parte contrária e ataca a nossa tese antes que alguém o faça. |
| **Estratégica** | Converte o diagnóstico em prioridade: o que merece atenção hoje e por quê. |

### Quatro regras aplicadas em código, não em marketing

1. **Não inventa documento.** Toda citação é validada contra o trecho realmente indexado
   ([`src/lib/intelligence/grounding.ts`](src/lib/intelligence/grounding.ts)). Referência
   inexistente é descartada antes de chegar à tela, e a confiança da resposta cai junto.
2. **Não prevê sentença.** Nenhuma análise afirma quem ganha. A simulação organiza o
   material decisório e aponta o que está controvertido.
3. **Não cria jurisprudência.** O acervo só aceita decisões importadas com URL da fonte
   oficial. Acervo vazio devolve zero resultados — nunca um julgado plausível inventado.
4. **Não finge ter IA.** Sem um modelo conectado, a plataforma continua operando por
   verificação estrutural determinística — e diz isso em toda tela, com o rótulo
   *modo demonstração*.

---

## Início rápido

Pré-requisitos: **Node 20.11+** e **PostgreSQL 14+ com a extensão `pgvector`**.

```bash
# 1. Dependências
npm install

# 2. Configuração
cp .env.example .env
#    Edite DATABASE_URL e gere um SESSION_SECRET:
#    openssl rand -base64 48

# 3. Banco de dados
npm run db:deploy      # aplica as migrações
npm run db:seed        # cria planos + escritório de demonstração

# 4. Rodar
npm run dev            # http://localhost:3000
```

O seed imprime as credenciais de acesso:

```
E-mail: demo@legalmind.local
Senha:  legalmind-demo-2026
```

O seed gera **PDFs fictícios de verdade** e os processa pelo mesmo pipeline de produção
(extração → OCR → chunking → embeddings → análise). Nada é pré-fabricado no banco para
parecer que houve análise. Todos os dados do caso são inventados e ficam marcados como
demonstração na interface.

### Sem chave de API

A configuração padrão (`AI_PROVIDER=local`) roda **sem nenhum serviço externo**. Nesse modo
as análises vêm de verificação estrutural determinística: extração de datas e valores,
detecção de alegações sem lastro documental, comparação numérica entre peças e recuperação
lexical por BM25. É genuinamente útil e claramente limitado — e a interface avisa.

Para ativar a análise completa:

```bash
AI_PROVIDER=anthropic          # ou openai | google
ANTHROPIC_API_KEY=sk-ant-...
EMBEDDING_PROVIDER=openai      # embeddings reais melhoram muito a recuperação
OPENAI_API_KEY=sk-...
```

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento (com worker embutido). |
| `npm run dev:clean` | Apaga o cache `.next` e sobe o dev. Use após trocar de branch. |
| `npm run clean` | Só apaga o cache `.next`. |
| `npm run build` / `npm start` | Build e execução de produção. |
| `npm run worker` | Worker dedicado da fila (produção multi-instância). |
| `npm test` | Testes unitários (118). |
| `npm run test:integration` | Testes de integração contra PostgreSQL real (49). |
| `npm run typecheck` | Verificação de tipos. |
| `npm run db:migrate` | Cria e aplica migração em desenvolvimento. |
| `npm run db:deploy` | Aplica migrações em produção. |
| `npm run db:seed` | Popula planos e a demonstração. |
| `npm run db:studio` | Prisma Studio. |

---

## Quando algo quebra

**`Cannot read properties of undefined (reading 'call')`** em qualquer tela, logo após
trocar de branch ou atualizar o código:

```bash
npm run dev:clean
```

É o cache do Webpack em `.next` apontando para um módulo que mudou de lugar. Acontece
sobretudo quando um arquivo vira diretório (foi o caso de
`src/lib/integrations/datajud.ts` → `src/lib/integrations/datajud/`): o mapa de módulos
guardado no cache ainda aponta para o arquivo apagado, `__webpack_require__` devolve
`undefined` e o erro estoura no componente que importa aquele módulo. Não é erro de
código — apagar `.next` resolve.

**A tela diz "Não conseguimos concluir a operação"**: em desenvolvimento a mensagem vem
acompanhada de `[dev] <causa real>`. As causas mais comuns são o PostgreSQL parado,
`DATABASE_URL` errada ou as migrações/seed não aplicados:

```bash
pg_isready                 # o banco responde?
npm run db:deploy          # migrações
npm run db:seed            # planos + demonstração
```

Em produção esse detalhe não é enviado ao cliente — só a mensagem genérica.

**A consulta ao DataJud falha**: rode o diagnóstico, que fala direto com o CNJ sem
passar pela aplicação e imprime a resposta bruta.

```bash
node scripts/datajud-doctor.mjs tjgo 0801234-56.2026.8.09.0051
```

Se a resposta não for JSON (por exemplo "Host not in allowlist"), quem respondeu foi um
proxy ou firewall da sua rede, não o CNJ — a própria interface distingue os dois casos.

---

## Arquitetura em uma tela

```
                    ┌───────────────────────────────────────────┐
   Navegador  ────▶ │  Next.js (App Router, RSC + rotas de API) │
                    └────────────┬──────────────────────────────┘
                                 │
        ┌────────────────────────┼─────────────────────────┐
        ▼                        ▼                         ▼
 ┌─────────────┐        ┌────────────────┐        ┌────────────────┐
 │  Serviços   │        │  Fila (Postgres)│───▶   │     Worker     │
 │ src/server  │        │   tabela jobs   │        │  src/worker    │
 └──────┬──────┘        └────────────────┘        └───────┬────────┘
        │                                                  │
        ▼                                                  ▼
 ┌───────────────────────────┐              ┌──────────────────────────────┐
 │ PostgreSQL + pgvector     │◀─────────────│ Pipeline de documentos        │
 │ dados + embeddings + FTS  │              │ extrair→OCR→chunk→embed→índice│
 └───────────────────────────┘              └───────────────┬──────────────┘
        ▲                                                    ▼
        │                                        ┌──────────────────────────┐
        │                                        │ Inteligência              │
        └────────────────────────────────────────│ RAG híbrido → LLM →       │
                                                 │ validação de citações     │
                                                 └───────────┬──────────────┘
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Provedor de IA (abstraído)   │
                                              │ Anthropic│OpenAI│Google│local│
                                              └──────────────────────────────┘
```

Detalhes em [`docs/architecture.md`](docs/architecture.md).

### Decisões que valem explicar

- **Fila no PostgreSQL, não Redis.** O volume de jobs é de dezenas por minuto por
  instância — muito abaixo do ponto em que uma fila em banco vira gargalo. Em troca
  ganhamos durabilidade transacional, inspeção por SQL e um componente a menos para
  operar. `SELECT ... FOR UPDATE SKIP LOCKED` garante que workers concorrentes não peguem
  o mesmo job.
- **Recuperação híbrida (vetor + full-text, fundidos por RRF).** Perguntas jurídicas
  misturam paráfrase ("o réu negou a cobrança?") com termos que precisam casar
  literalmente (valores, artigos, nomes). Só vetores erram o termo exato; só full-text
  erra a paráfrase.
- **Chunk nunca cruza página.** Custa alguns chunks pequenos, mas garante que a citação
  "página 37" seja sempre exata — que é o compromisso central do produto.
- **Provedores de IA via `fetch`, sem SDK.** Três chamadas HTTP simples em vez de três
  dependências pesadas com ciclos de release próprios; trocar de fornecedor não toca o
  resto da aplicação.
- **Ícones e gráficos desenhados à mão.** Uma biblioteca de ícones e uma de charts
  custariam ~150 KB de bundle para o que aqui são ~40 linhas de SVG.

---

## Estrutura

```
prisma/
  schema.prisma          modelo de dados (35 tabelas)
  migrations/            SQL versionado, inclui pgvector e tsvector gerado
  seed.ts, demo-case.ts  demonstração com PDFs gerados e processados de verdade
src/
  app/
    (marketing)/         landing, termos, privacidade
    (auth)/              entrar, criar conta
    (app)/               dashboard, processos, documentos, inteligência,
                         prazos, tarefas, jurisprudência, relatórios,
                         clientes, equipe, configurações, admin
    api/                 route handlers
  components/            kit de UI, visualizador de PDF, painel de evidência
  lib/
    ai/                  provedores, embeddings, preços, telemetria
    auth/                sessão, senha, permissões
    documents/           extração, OCR, chunking, classificação, pipeline
    intelligence/        prompts, heurísticas, grounding, análises, chat
    rag/                 vector store, recuperação híbrida, contexto
    deadlines/           cálculo de prazos (CPC)
    security/            criptografia, rate limiting
    text/                NLP em português (BM25, entidades)
  server/                serviços de domínio
  worker/                fila e handlers
tests/
  unit/                  65 testes
  integration/           45 testes contra PostgreSQL real
docs/                    arquitetura, banco, API, deploy, segurança
```

---

## Testes

```bash
npm test                  # 65 testes unitários
npm run test:integration  # 45 testes de integração (exige TEST_DATABASE_URL)
```

A suíte de integração cobre o que mais importa num SaaS jurídico:

- **Isolamento entre organizações** — cada caminho de leitura e escrita é exercitado com
  o ID de outra organização e precisa falhar (14 testes);
- **Pipeline completo** — PDF real → páginas → chunks → embeddings → RAG → análise →
  citações verificáveis, incluindo a detecção da divergência de valor entre inicial e
  contestação (16 testes);
- **Contas, planos e LGPD** — hash de senha, revogação de sessões, limites de plano,
  governança de proprietários, exportação e exclusão de conta (15 testes).

---

## Estado de implementação

**Implementado e funcionando**

Autenticação e sessões · multi-tenancy com isolamento testado · RBAC de 5 perfis ·
upload com validação de assinatura binária · extração de PDF/DOCX/TXT por página ·
OCR opcional via tesseract · chunking com fronteira de página · embeddings ·
busca híbrida com pgvector + full-text português · 10 tipos de análise · chat contextual
com citações verificadas · visualizador de PDF com salto para a página citada ·
linha do tempo · mapa de provas · detector de contradições · prazos com cálculo CPC ·
tarefas · clientes · equipe · acervo de jurisprudência · Memória do Escritório ·
relatórios PDF/DOCX · notificações · auditoria · planos e créditos · telemetria de custo
de IA · painel administrativo da plataforma · landing page · termos e privacidade.

**Integração futura — declarado, não simulado**

| Recurso | Estado | O que falta |
| --- | --- | --- |
| Cobrança automática | Planos, limites e créditos operam; nenhuma cobrança é processada | Credenciais Stripe ou Mercado Pago (`PAYMENT_PROVIDER`) |
| Convite por e-mail | Tabela `invites` existe; adição de membro é manual | Provedor de e-mail transacional |
| Movimentações processuais | Camada de integração isolada, sem fonte conectada | Acesso autorizado a API de tribunal |
| Importação automática de jurisprudência | Importação manual com URL da fonte | Acordo de acesso às bases oficiais |
| Radar de teses | Não implementado | Depende do item acima |

Nenhum desses recursos aparece na interface como se estivesse pronto.

---

## Aviso

O LegalMind AI é ferramenta de apoio à decisão. As análises são estratégicas e
probabilísticas, não constituem parecer jurídico e não substituem a avaliação do advogado
responsável. A plataforma não prevê resultados de julgamento. O cálculo de prazos é
indicativo e não considera feriados locais nem suspensões de cada tribunal.

Consulte [`docs/security.md`](docs/security.md) para o modelo de segurança e privacidade.
