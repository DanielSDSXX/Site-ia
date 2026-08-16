# Arquitetura

## Visão geral

Aplicação Next.js (App Router) com três processos lógicos:

1. **Web** — React Server Components para leitura, route handlers para escrita.
2. **Worker** — consome a fila e roda ingestão de documentos e análises.
3. **PostgreSQL** — dados relacionais, embeddings (pgvector), índice full-text e a fila.

Em desenvolvimento e em deploys single-node o worker roda embutido no processo web
(`QUEUE_INLINE_WORKER=true`). Em produção distribuída, use `npm run worker` num processo
dedicado e desligue o worker embutido.

```
Navegador
   │  HTTPS
   ▼
Next.js ──── middleware (redirect + CSP)
   ├── RSC: lê via src/server/*  ──────────┐
   └── /api/*: valida (Zod) → serviço      │
                    │                       │
                    ├── enfileira job ──────┼──▶ tabela jobs
                    └── grava no storage    │
                                            ▼
                                      PostgreSQL
                                      + pgvector
                                      + tsvector
                                            ▲
Worker (polling FOR UPDATE SKIP LOCKED) ────┘
   ├── document.process  → pipeline de ingestão
   ├── analysis.run      → orquestrador de análises
   └── maintenance.prune → limpeza periódica
```

## Camadas

| Camada | Diretório | Responsabilidade |
| --- | --- | --- |
| Apresentação | `src/app`, `src/components` | Telas e componentes. Nenhuma regra de negócio. |
| API | `src/app/api` | Validação, autorização, rate limit, auditoria. Delega ao serviço. |
| Serviços | `src/server` | Regras de negócio. **Recebem `organizationId` explicitamente.** |
| Domínio | `src/lib/*` | Documentos, RAG, inteligência, prazos, segurança. |
| Infra | `src/lib/db`, `storage`, `queue`, `ai` | Adaptadores substituíveis. |

Regra que sustenta o multi-tenancy: **serviços nunca inferem a organização**. O
`organizationId` é sempre parâmetro, vindo de `requireAuth()`/`requirePermission()`, e
entra na cláusula `WHERE` de cada consulta. É por isso que o teste de isolamento consegue
exercitar cada caminho passando o ID de outra organização.

## Pipeline de documentos

`src/lib/documents/pipeline.ts` — roda sempre no worker, reportando progresso pelas
mesmas etapas que a interface exibe.

```
arquivo no storage
   ↓  extract.ts        PDF (pdf.js) | DOCX (mammoth) | TXT | imagem
páginas com texto      ← preserva DOCUMENTO → PÁGINA
   ↓  ocr.ts            páginas sem camada de texto (opcional, tesseract)
   ↓  classify.ts       tipo da peça por evidência lexical ponderada
   ↓  chunk.ts          ~1400 caracteres, sobreposição 180, NUNCA cruza página
   ↓  embeddings        lotes de 32, gravados via SQL na coluna vector(1536)
documento INDEXED
   ↓
análise inicial (estrutura → resumo → linha do tempo)
```

Pontos que valem destacar:

- **Idempotência.** Reprocessar apaga páginas e chunks e refaz tudo; um job repetido após
  falha não duplica dados.
- **Fronteira de página.** Um chunk nunca contém texto de duas páginas. É o que torna
  "página 37" uma afirmação exata em vez de aproximada.
- **Reconstrução do texto do PDF.** `joinTextItems` usa a coordenada Y dos fragmentos —
  `hasEOL` sozinho não é confiável em PDFs de tribunais — e combina os dois sinais numa
  única quebra, para não transformar cada linha visual em parágrafo.
- **Valores quebrados entre linhas.** A extração de valores aceita espaços em branco
  (inclusive quebra de linha) entre `R$` e o número: em peças reais isso é comum, e
  ignorar esses casos deixaria valores relevantes fora da análise.
- **Sem OCR configurado**, páginas sem texto ficam marcadas como `needsOcr` e a interface
  informa quantas páginas ficaram fora da análise. Uma lacuna declarada é preferível a um
  texto silenciosamente ausente.

## RAG

### Indexação

Cada chunk carrega:

- `embedding vector(1536)` — gerenciado por SQL bruto (Prisma não expõe tipos
  `Unsupported`), com índice HNSW e distância de cosseno;
- `searchVector tsvector` — **coluna gerada** `to_tsvector('portuguese', content)`, com
  índice GIN. Sendo gerada, nunca fica dessincronizada do conteúdo.

Dimensão canônica: 1536. `normalizeVector` trunca ou completa com zeros e renormaliza, o
que permite trocar de modelo sem migrar o schema — mas **vetores de modelos diferentes não
são comparáveis**, então trocar de modelo exige reindexar.

### Recuperação

`src/lib/rag/retriever.ts` executa as duas buscas em paralelo e funde por **Reciprocal
Rank Fusion** (`k = 60`), que combina duas listas sem exigir que os scores estejam na
mesma escala.

Para análises de visão global (resumo, vulnerabilidades) usamos
`retrieveProcessOverview`: cobre todos os documentos, com cota proporcional ao peso do
tipo de peça (petição inicial e contestação pesam 3; procuração, 0,3) e amostragem
uniforme ao longo de cada documento — evita concentrar tudo nas primeiras páginas.

### Contexto e citações

`buildContext` transforma os chunks em blocos:

```
<trecho ref="D1:p7:c0" documento="Petição inicial" pagina="7">
...texto literal...
</trecho>
```

O `ref` é a única forma de o modelo citar uma fonte. Depois da geração,
`resolveRefs`/`stripInvalidRefs` conferem cada ref contra o contexto enviado:

- ref inexistente → **descartado** e contabilizado em `droppedRefs`;
- afirmação que perdeu todas as fontes → confiança rebaixada (`adjustConfidence` nunca
  aumenta a confiança declarada);
- contradição sem os dois lados verificáveis → **não é exibida**;
- citação literal de contradição é conferida contra o texto de origem
  (`quoteAppearsInChunk`); se não bater, o achado é rebaixado e marcado.

Esse é o sistema anti-alucinação, implementado como código verificável em vez de
instrução de prompt.

## Camada de IA

```ts
interface AIProvider {
  name: string;
  isDemo: boolean;          // true = não é um LLM
  defaultModel: string;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
```

Implementações: `AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`,
`LocalExtractiveProvider`. Todas via `fetch` — sem SDKs. Se o provedor externo estiver
selecionado mas sem chave, a fábrica cai no local e marca `isDemo`, o que faz a interface
avisar; falhar em silêncio seria pior, fingir que há IA seria inaceitável.

### Provedor local

Não simula um LLM. É um extrator determinístico: recebe o contexto, ranqueia frases por
BM25 contra a pergunta (isolada por `<pergunta>` no prompt, para o cabeçalho não poluir a
consulta) e devolve as passagens **literalmente**, com um aviso explícito.

As análises estruturadas não passam por ele: `runAnalysis` verifica `provider.isDemo` e
roteia para `src/lib/intelligence/heuristics.ts`, que produz o mesmo formato de saída por
verificação estrutural — datas, valores, alegações sem lastro, divergências entre peças.

### Detecção de contradições (modo heurístico)

Duas regras, separadas por confiabilidade:

1. **Contestação explícita** (confiança média) — uma peça usa marcador de contradição
   ("e não", "ao contrário do alegado", "diverge") na *mesma frase* de um número, e outro
   documento traz número diferente do mesmo tipo. O pareamento combina sobreposição
   lexical com **proximidade numérica** — é o que separa a divergência real
   (R$ 569,70 × R$ 549,00) do ruído (R$ 569,70 × R$ 15.569,70).
2. **Contexto semelhante** (confiança baixa) — janelas com alta sobreposição lexical e
   números diferentes.

O que a heurística não alcança: divergências entre trechos escritos com vocabulário
completamente distinto. Isso exige leitura semântica — mais um motivo para o rótulo de
demonstração.

## Fila

Tabela `jobs` com `status`, `priority`, `runAt`, `attempts`, `lockedAt/lockedBy`,
`progress`.

- **Reivindicação atômica** — `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED
  LIMIT 1)`: dois workers nunca pegam o mesmo job sem serializar a fila.
- **Backoff exponencial** — 1, 2, 4… minutos, até 15, com no máximo 3 tentativas.
- **Recuperação de worker morto** — jobs `RUNNING` com lock acima de 10 minutos voltam
  para a fila.
- **Progresso** — o handler reporta percentual e rótulo; a interface faz polling e mostra
  a etapa atual sem travar.

## Armazenamento

`StorageDriver` com duas implementações: disco local e S3-compatível (AWS, R2, MinIO).

- Nenhum arquivo é servido estaticamente. O único caminho é
  `GET /api/documents/:id/content`, que valida sessão, organização e permissão, e registra
  download na auditoria.
- Criptografia em repouso opcional (AES-256-GCM, `STORAGE_ENCRYPTION_KEY`), com cabeçalho
  mágico que permite ler arquivos gravados antes de a chave existir.
- Chaves de armazenamento são prefixadas por organização e sanitizadas contra path
  traversal.

## Escalabilidade

| Gargalo | Abordagem atual | Próximo passo |
| --- | --- | --- |
| Requisições web | Stateless (sessão no banco) | Escalar horizontalmente |
| Ingestão | Fila durável + workers concorrentes | Mais processos `npm run worker` |
| Busca vetorial | HNSW no pgvector | Partição por organização; réplicas de leitura |
| Custo de IA | Telemetria por operação/organização | Cache de análises; modelo menor por operação |
| Storage | S3-compatible | Já escala; ajustar política de retenção |

Consultas quentes usam índices compostos por `organizationId` — ver
[`database.md`](database.md).
