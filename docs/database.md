# Banco de dados

PostgreSQL 14+ com **pgvector** (busca vetorial) e **pg_trgm** (busca por similaridade em
números de processo e nomes). Schema em [`prisma/schema.prisma`](../prisma/schema.prisma);
SQL versionado em `prisma/migrations/`.

## Princípios

1. **Multi-tenancy explícito.** Toda tabela de negócio carrega `organizationId`. Não há
   Row-Level Security: o isolamento é aplicado na cláusula `WHERE` de cada consulta e
   coberto por testes de integração que tentam ativamente o acesso cruzado.
2. **Rastreabilidade.** Todo texto analisado é ancorado em
   `Document → DocumentPage → DocumentChunk`, e toda afirmação da IA aponta para uma
   `Citation` com documento, página e trecho.
3. **Exclusão lógica onde há valor histórico** (`deletedAt` em User, Organization, Client,
   Process, Document) e **exclusão física onde a lei pede efetividade** (arquivo no
   storage e chunks indexados são removidos de fato).

## Grupos de tabelas

### Identidade e organização

| Tabela | Papel |
| --- | --- |
| `users` | Conta. Senha só como hash bcrypt; contador de falhas e bloqueio temporário. |
| `sessions` | Sessão opaca: guarda o **hash** do token, nunca o token. Revogável. |
| `organizations` | O escritório. Raiz do isolamento. |
| `memberships` | Usuário × organização × papel. Único por par. |
| `invites` | Convites (integração futura: envio de e-mail). |

### Billing

`plans` (limites e créditos por tier) · `subscriptions` (uma por organização) ·
`credit_ledger_entries` (razão de créditos com `balanceAfter`, para auditar consumo sem
recomputar histórico).

### Núcleo jurídico

`clients` · `processes` · `parties`

`processes` guarda o estado da inteligência (`riskLevel`, `riskScore`, `riskRationale`,
`executiveSummary`, `currentSituation`, `probableNextStep`, `lastAnalyzedAt`). Esses
campos são **escritos apenas por análises**, nunca à mão — é o que garante que o risco
exibido tenha uma análise por trás.

### Documentos

```
documents ──1:N──▶ document_pages ──1:N──▶ document_chunks
```

`document_chunks` é a tabela central da recuperação:

| Coluna | Observação |
| --- | --- |
| `pageNumber`, `pageId` | Ancoragem exata. Chunk nunca cruza página. |
| `content` | Texto do trecho. |
| `charStart`, `charEnd` | Posição na página. |
| `embedding vector(1536)` | Gerenciada por SQL bruto; índice HNSW cosseno. |
| `searchVector tsvector` | **Coluna gerada** `to_tsvector('portuguese', content)`; índice GIN. |
| `embeddingModel`, `embeddedAt` | Permite detectar índice desatualizado após troca de modelo. |

### Grafo do processo

`claims` (fato / alegação / pedido / tese / defesa) · `evidence` · `legal_issues` ·
`arguments` · `timeline_events`

Esse conjunto materializa a cadeia
`Fato → Documento → Página → Prova → Tese → Argumento → Pedido`, que é a base para o
futuro grafo visual do processo.

### Inteligência

| Tabela | Papel |
| --- | --- |
| `ai_analyses` | Uma execução. Guarda `result` (JSON validado), provedor, modelo, `chunkIdsUsed`, duração. |
| `findings` | Saída unitária: vulnerabilidade, contradição, argumento adversarial, ação estratégica, lacuna de prova. |
| `citations` | **O elo com a fonte.** Liga achado/análise/mensagem a documento + página + trecho literal. |
| `chat_threads`, `ai_messages` | Conversas por processo e usuário. |

`citations` é polimórfica por colunas opcionais (`analysisId`, `findingId`, `messageId`,
`argumentId`, `claimId`, `jurisprudenceId`) em vez de uma tabela de junção por tipo:
mantém uma única consulta para "todas as fontes desta tela".

### Operação

`deadlines` (com `computed` e `computationNote` — um prazo calculado sempre carrega a
explicação e o aviso) · `tasks` · `reports` · `notifications`

### Conhecimento

`jurisprudence` — `sourceUrl` + `sourceName` obrigatórios na importação; `verified`
indica que há fonte informada; `isDemo` marca conteúdo fictício. Embedding próprio.

`org_memory_items` — Memória do Escritório, isolada por organização, com embedding.

### Infraestrutura

`jobs` (fila) · `ai_usage` (telemetria de custo) · `audit_logs` (IP pseudonimizado) ·
`rate_limit_buckets` (janela fixa persistida).

## Índices que importam

```sql
-- Recuperação semântica e lexical
CREATE INDEX document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX document_chunks_search_idx    ON document_chunks USING GIN ("searchVector");
CREATE INDEX ON document_chunks ("organizationId", "processId");

-- Listagens quentes
CREATE INDEX ON processes  ("organizationId", status);
CREATE INDEX ON processes  ("organizationId", "riskLevel");
CREATE INDEX ON deadlines  ("organizationId", "dueDate", status);
CREATE INDEX ON tasks      ("organizationId", status, "dueDate");
CREATE INDEX ON findings   ("processId", type);

-- Busca global aproximada
CREATE INDEX processes_number_trgm_idx ON processes USING GIN (number gin_trgm_ops);
CREATE INDEX clients_name_trgm_idx     ON clients   USING GIN (name gin_trgm_ops);
```

## Migrações

```bash
npm run db:migrate                     # desenvolvimento: cria e aplica
npx prisma migrate dev --create-only   # gerar SQL para editar à mão
npm run db:deploy                      # produção
```

A migração inicial contém três coisas que o Prisma não gera sozinho e que foram escritas
manualmente: `CREATE EXTENSION vector`, a coluna gerada `searchVector` e os índices HNSW.
Ao criar novas migrações, confira se o Prisma não tentou remover esses objetos.

### Sem pgvector

Rode com `VECTOR_DRIVER=none` e remova os três índices HNSW da migração inicial. A
recuperação passa a usar apenas full-text — funciona, com qualidade menor em paráfrases.

## Trocar de modelo de embeddings

Vetores de modelos diferentes não são comparáveis. Depois de trocar
`EMBEDDING_PROVIDER`/`EMBEDDING_MODEL`:

```sql
UPDATE document_chunks SET embedding = NULL, "embeddedAt" = NULL;
```

E reprocesse os documentos (botão *Reprocessar* na aba Documentos, ou
`POST /api/documents/:id/reprocess`). A tela de Configurações → IA mostra quantos trechos
ainda estão pendentes de embedding.

## Backup

```bash
pg_dump --format=custom --file=legalmind.dump "$DATABASE_URL"
pg_restore --dbname="$DATABASE_URL" --clean --if-exists legalmind.dump
```

O backup do banco **não** inclui os arquivos originais: faça backup separado de
`STORAGE_LOCAL_DIR` ou do bucket S3. Se `STORAGE_ENCRYPTION_KEY` estiver em uso, guarde a
chave junto — sem ela os arquivos são irrecuperáveis.
