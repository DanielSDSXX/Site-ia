# API

Todas as rotas ficam sob `/api`. Autenticação por cookie de sessão (`lm_session`,
httpOnly, SameSite=Lax, Secure em produção).

## Convenções

**Erros** seguem sempre o mesmo formato, e nunca expõem detalhe interno:

```json
{ "error": { "code": "validation_error", "message": "Dados inválidos.", "details": [...] } }
```

| Código HTTP | Situação |
| --- | --- |
| 401 | Sem sessão válida |
| 403 | Sem permissão, ou origem não reconhecida (anti-CSRF) |
| 402 | Limite de plano ou créditos esgotados |
| 404 | Não encontrado **ou pertencente a outra organização** |
| 409 | Conflito (número de processo duplicado, processo sem documentos) |
| 422 | Falha de validação |
| 429 | Rate limit |

Recursos de outra organização retornam **404, não 403** — responder 403 confirmaria a
existência do registro.

**Anti-CSRF.** Todo `POST/PUT/PATCH/DELETE` verifica `Origin` (ou `Referer`) contra o host
servido e `APP_URL`. Requisição cross-site é rejeitada com 403 mesmo com cookie válido.

**Rate limiting** por janela fixa persistida no banco: login 8/5min (por IP e por e-mail),
cadastro 5/h, upload 60/h, análises 40/h, chat 120/h, busca 300/h.

---

## Autenticação

### `POST /api/auth/register`
```json
{ "name": "Ana Ribeiro", "email": "ana@escritorio.com.br",
  "password": "…", "organizationName": "Ribeiro & Associados", "acceptedTerms": true }
```
Cria usuário, escritório, associação OWNER e assinatura Free numa transação; concede os
créditos iniciais e abre sessão. → `201`

### `POST /api/auth/login`
`{ "email": "…", "password": "…" }` → `200`.
Oito falhas bloqueiam a conta por 15 minutos. Usuário inexistente ainda executa uma
verificação fictícia de senha, para não vazar existência por tempo de resposta.

### `POST /api/auth/logout` → `200`

### `GET /api/auth/session`
Sessão atual com usuário, organização ativa, papel, lista de permissões e organizações
disponíveis.

### `POST /api/auth/session`
`{ "organizationId": "…" }` — troca a organização ativa.

---

## Processos

### `GET /api/processes`
Filtros: `q`, `status`, `risk`, `clientId`, `responsibleId`, `deadlineSoon`, `noMovement`,
`sort` (`recent|risk|deadline|number`), `page`, `pageSize` (5–100).

```json
{ "items": [ { "id": "…", "number": "0801234-56.2026.8.09.0051",
               "riskLevel": "HIGH", "riskScore": 72,
               "nextDeadline": { "dueDate": "2026-03-10T00:00:00.000Z" },
               "documentCount": 5, "findingCount": 12 } ],
  "total": 1, "page": 1, "pageSize": 25 }
```

### `POST /api/processes`
Exige `process:write`. O número CNJ tem o dígito verificador validado (módulo 97,
ISO 7064); números fora do padrão CNJ são aceitos sem validação.

### `GET /api/processes/:id`
Processo completo: partes, documentos, prazos, tarefas, linha do tempo, alegações,
questões jurídicas.

### `PATCH /api/processes/:id` · `DELETE /api/processes/:id`
Atualização e exclusão lógica. Exclusão exige `process:delete` (ADMIN+).

### `GET /api/processes/:id/timeline`

### `GET /api/processes/:id/status`
Estado de processamento — usado pelo polling da interface: documentos pendentes, progresso
de cada job, análises em execução e um booleano `idle`.

---

## Documentos

### `POST /api/processes/:id/documents`
`multipart/form-data`, campo `files` (até 30 arquivos).

Validação: tamanho (`MAX_UPLOAD_MB`), MIME permitido e **assinatura binária** — um
executável renomeado para `.pdf` é rejeitado. Deduplicação por SHA-256 dentro do processo.

```json
{ "documents": [ { "documentId": "…", "jobId": "…", "duplicated": false, "title": "…" } ],
  "errors": [] }
```

O processamento é assíncrono; acompanhe por `GET /api/jobs/:jobId`.

### `GET /api/documents` · `GET /api/documents/:id` · `DELETE /api/documents/:id`

### `GET /api/documents/:id/content`
**Único** caminho de acesso ao arquivo. Sem URL pública nem link assinado. `?download=1`
força download e registra auditoria. A resposta traz `Content-Security-Policy: sandbox` e
`Cache-Control: private, no-store`.

### `GET /api/documents/:id/pages`
Lista de páginas com contagem de caracteres e sinalização de OCR.
`?page=N` devolve o texto extraído daquela página — é o que alimenta o destaque do trecho
no visualizador.

### `POST /api/documents/:id/reprocess`

---

## Inteligência

### `POST /api/processes/:id/analyze`
```json
{ "type": "VULNERABILITIES", "instructions": "foco na preliminar", "async": true }
```

Tipos: `PROCESS_SUMMARY`, `TIMELINE`, `VULNERABILITIES`, `ADVERSARIAL`,
`TRIAL_SIMULATION`, `CONTRADICTIONS`, `NEXT_ACTIONS`, `EVIDENCE_MAP`,
`CLIENT_EXPLANATION`, `STRUCTURE_EXTRACTION`.

`async: true` (padrão) → `{ "queued": true, "jobId": "…" }`
`async: false` → executa inline e devolve:

```json
{ "queued": false, "analysisId": "…", "demo": true,
  "confidence": "LOW", "citationsCount": 3, "droppedRefs": [] }
```

`demo: true` significa que **nenhum LLM estava conectado** — o resultado veio da
verificação estrutural. `droppedRefs` lista referências que o modelo citou e não existiam
no contexto; elas foram descartadas antes de virar citação.

### Atalhos equivalentes

`POST /api/processes/:id/vulnerabilities` · `/adversarial-analysis` · `/simulate` ·
`/contradictions` · `/next-actions` · `/evidence-map` · `/client-explanation`

Todos enfileiram e devolvem `{ queued: true, jobId, type }`.

### `POST /api/processes/:id/chat`
```json
{ "question": "Quais são os três maiores riscos?",
  "threadId": null, "verbosity": "detailed", "useOrgMemory": false }
```

```json
{ "threadId": "…", "messageId": "…", "content": "…", "confidence": "MEDIUM",
  "demo": false, "droppedRefs": [],
  "citations": [ { "ref": "D2:p14:c3", "documentId": "…",
                   "documentTitle": "Contestação", "pageNumber": 14, "quote": "…" } ] }
```

Cada `citation` abre o documento na página exata na interface. `GET` na mesma rota lista
as conversas do usuário naquele processo.

---

## Operação

| Rota | Métodos | Permissão |
| --- | --- | --- |
| `/api/clients` | GET, POST | `client:read` / `client:write` |
| `/api/clients/:id` | GET, PATCH, DELETE | idem |
| `/api/tasks` | GET, POST | `task:read` / `task:write` |
| `/api/tasks/:id` | PATCH, DELETE | `task:write` |
| `/api/deadlines` | GET, POST, PUT | `deadline:read` / `deadline:write` |
| `/api/deadlines/:id` | PATCH | `deadline:write` |
| `/api/notifications` | GET, POST | autenticado |
| `/api/search` | GET | autenticado |
| `/api/team` | GET, PATCH, DELETE | `team:read` / `team:manage` |
| `/api/organization` | GET, PATCH | autenticado / `org:settings` |
| `/api/jobs/:id` | GET | autenticado |

**`POST /api/tasks`** aceita `{ "fromFindingId": "…" }` para converter um achado da IA em
tarefa, preservando descrição e sugestão.

**`PUT /api/deadlines`** pré-visualiza o cálculo sem gravar:

```json
{ "baseDate": "2026-02-02", "days": 15, "countingMode": "BUSINESS_DAYS" }
→ { "dueDate": "2026-02-25T00:00:00.000Z", "skippedDays": 8, "note": "Contagem em dias úteis…" }
```

A `note` sempre declara as limitações do cálculo.

---

## Jurisprudência e memória

### `GET /api/busca-juridica` — a busca da tela

Endpoint único da tela **Busca jurídica**. Recebe o número do processo **ou** uma
palavra-chave e consulta as duas fontes em paralelo, devolvendo os dois grupos numa
resposta só.

```
GET /api/busca-juridica?q=cobrança indevida
→ {
    "query": "cobrança indevida",
    "byCaseNumber": false,
    "processes": [ … ],      // CNJ DataJud
    "processesTotal": 1,
    "processesError": null,
    "index": "api_publica_tjgo",
    "entendimentos": [ … ],  // acervo do escritório
    "entendimentosError": null
  }
```

Parâmetros: `q` (obrigatório), `court` (opcional — com número CNJ completo o tribunal
sai dos próprios dígitos), `limit`, `includeDemo`.

As fontes são independentes por `Promise.allSettled`: o CNJ fora do ar devolve
`processesError` preenchido e **não** impede os entendimentos de aparecerem. Foi
exatamente essa dependência que quebrava o buscador — uma fonte vazia zerava a tela
inteira.

Sem `q`, devolve `{ status, courts }` para a tela se montar.

### `GET /api/jurisprudence`
Sem `q`: lista o acervo. Com `q`: busca híbrida (embedding + BM25) e devolve `score`.

Por padrão a busca considera apenas decisões com fonte oficial. `includeDemo=true`
inclui também os exemplos fictícios do seed, que vêm marcados com `isDemo: true` e
aparecem na interface com o selo **Fictícia — demonstração**.

### `POST /api/jurisprudence`
`sourceUrl` e `sourceName` são **obrigatórios**. Decisão sem fonte verificável não entra
no acervo — é a regra que impede a plataforma de apresentar julgados não conferíveis.

### `POST /api/jurisprudence/bulk` — importação em lote

Recebe uma planilha colada (CSV, TSV ou o que sai ao copiar do Excel) e cria um
entendimento por linha. É o caminho que dá conteúdo ao buscador: sem ementas
cadastradas, a busca por entendimentos não tem o que devolver, porque **a API do CNJ
não publica ementas**.

```json
{ "text": "Tribunal,Número do processo,Ementa,URL,Fonte\nTJGO,0801234-…,…", "dryRun": true }
→ { "totalRows": 3, "valid": 2, "imported": 0, "duplicates": 0,
    "errors": [ { "line": 4, "field": "sourceUrl", "message": "Informe a URL da fonte oficial." } ],
    "missingColumns": [], "unknownHeaders": [], "preview": [ … ] }
```

`dryRun: true` confere sem gravar — é o que a tela usa para mostrar a prévia antes de o
usuário confirmar. Duas garantias:

- **Nada entra pela metade em silêncio.** Cada linha é validada sozinha e o relatório diz,
  por número de linha, o que foi recusado e por quê.
- **A regra da fonte vale linha a linha.** Importar em massa não é atalho para entrar
  decisão não conferível no acervo.

Reimportar a mesma planilha não duplica: mesmo tribunal + mesmo número conta como
`duplicates`. Colunas aceitas em português ou inglês, com ou sem acento (`tribunal`,
`ementa`, `número do processo`, `url`, `fonte`, `relator`, `data`, `tese`, `resultado`,
`trecho`, `órgão julgador`); colunas desconhecidas voltam em `unknownHeaders` em vez de
serem descartadas caladas.

---

## Consulta processual — CNJ DataJud

Fonte **oficial** do Conselho Nacional de Justiça para dados processuais. Fica separada
da jurisprudência por um motivo concreto: a API Pública do DataJud publica número,
classe, assuntos, órgão julgador, grau, nível de sigilo e **movimentações** — e não
publica ementa, inteiro teor, relator nem tese. Ela responde "o que aconteceu neste
processo", não "quais decisões existem sobre este tema". Tratar um andamento como
precedente seria um erro caro, então as duas fontes não se misturam em lista nenhuma.

### O que o CNJ não entrega — e como a plataforma lida

Duas informações que os usuários pedem **não existem** nesta API. Em vez de inventá-las,
a plataforma é explícita sobre a origem de cada uma:

| Informação | Origem real | Como aparece |
| --- | --- | --- |
| Situação (ativo/suspenso/arquivado) | Não existe campo na API | Deduzida da última movimentação decisiva, com `inferred: true` e `basis` apontando o andamento que a sustenta. Sem movimentação conclusiva, `INDEFINIDO` — nunca "ativo" por omissão. |
| Nome das partes | Não publicado pelo CNJ | Vem do cadastro do próprio escritório (`local.parties`), quando o número CNJ bate. A tela diz de onde veio e avisa quando não há cadastro. |

Regras de dedução (`src/lib/integrations/datajud/situation.ts`), avaliadas da movimentação
mais recente para a mais antiga: desarquivamento e levantamento de suspensão reativam;
baixa definitiva encerra; arquivamento arquiva; suspensão/sobrestamento suspendem. A ordem
importa — "desarquivamento" contém "arquivamento".

**Segredo de justiça:** `nivelSigilo > 0` gera aviso destacado na ficha, alertando que os
dados podem vir incompletos e que o conteúdo não deve ser compartilhado fora dos autos.

Requer `DATAJUD_ENABLED=true` e `DATAJUD_API_KEY` (chave pública divulgada pelo CNJ).
Desativada, a API responde normalmente com `enabled: false` e o motivo — a tela mostra
o que configurar em vez de fingir que não há resultados.

### `GET /api/datajud`
Sem `q`: devolve `{ status, courts }` — estado da integração e os 37 índices do CNJ,
usado pela tela para se montar.

Com `q`: consulta o índice do tribunal escolhido.

O parâmetro `court` é opcional: com o número CNJ completo, o tribunal é deduzido dos
próprios dígitos (segmento `J` e tribunal `TR`), cobrindo Justiça Federal e Estadual.
Quando não dá para afirmar, a escolha volta para o usuário em vez de cair num índice
qualquer e responder "não encontrado" pelo motivo errado.

```
GET /api/datajud?q=0000832-35.2018.4.01.3202
→ { "enabled": true, "index": "api_publica_trf1", "total": 1,
    "processes": [ {
      "caseNumber": "0000832-35.2018.4.01.3202",
      "secrecy": { "level": 0, "isSecret": false, "label": "Público" },
      "situation": { "code": "ATIVO", "label": "Em curso", "inferred": true,
                     "basis": { "name": "Citação", "occurredAt": "…" } },
      "local": { "id": "…", "parties": [ { "name": "…", "role": "Autor", "side": "OURS" } ] },
      "movements": [ … ]
    } ], "error": null }
```

Falhas de rede ou do Elasticsearch voltam em `error` com texto legível, nunca como
lista vazia — o usuário precisa distinguir "não existe processo" de "a integração caiu".

### `POST /api/datajud`
Importa as movimentações do processo para a linha do tempo. Exige `process:write`.

```json
{ "processId": "…", "caseNumber": "00008323520184013202", "court": "api_publica_trf1" }
→ { "imported": 34, "skipped": 2, "statusChanged": "ARCHIVED",
    "caseNumber": "…", "index": "…", "situation": "Arquivado" }
```

Os eventos entram com `isInferred: false` — são registro oficial do tribunal, não
dedução da análise. A reimportação não duplica: movimentos com mesma data e mesmo
título são ignorados. A ação é auditada com `metadata.source = "datajud"`.

`statusChanged` só vem preenchido quando a situação lida é **conclusiva** (arquivamento,
baixa, suspensão). "Em curso" por ausência de sinal contrário não sobrescreve o que o
escritório anotou no cadastro.

Diagnóstico fora da aplicação: `node scripts/datajud-doctor.mjs tjsp "execução fiscal"`
imprime a requisição e a resposta bruta do CNJ.

### `/api/memory` — GET, POST, PATCH (ativar/desativar), DELETE
Memória do Escritório. Itens são indexados para busca semântica e usados apenas como
referência de estilo e estratégia, nunca como prova ou jurisprudência.

---

## Relatórios

### `POST /api/reports`
```json
{ "processId": "…", "type": "executive", "format": "pdf" }
```

Tipos: `executive`, `client`, `internal`, `risk`, `full`. Formatos: `pdf`, `docx`.
Retorna o arquivo no corpo com `Content-Disposition: attachment`.

Nenhuma IA é chamada aqui: o relatório apresenta análises já existentes. Se elas foram
produzidas em modo demonstração, o documento declara isso na primeira página.

---

## Conta e plataforma

### `GET /api/account` — exporta os dados do usuário em JSON (LGPD, art. 18, V)
### `PATCH /api/account` — troca de senha; revoga as demais sessões
### `DELETE /api/account` — anonimiza a conta (LGPD, art. 18, VI)
### `GET /api/admin/overview` — painel da plataforma; exige `isPlatformAdmin`

---

## Exemplo completo

```bash
BASE=http://localhost:3000

curl -c jar -X POST $BASE/api/auth/login -H "content-type: application/json" \
  -H "origin: $BASE" -d '{"email":"demo@legalmind.local","password":"legalmind-demo-2026"}'

PID=$(curl -s -b jar "$BASE/api/processes?pageSize=5" | jq -r '.items[0].id')

curl -b jar -X POST "$BASE/api/processes/$PID/documents" \
  -H "origin: $BASE" -F "files=@peticao.pdf" -F "files=@contestacao.pdf"

curl -b jar -X POST "$BASE/api/processes/$PID/vulnerabilities" -H "origin: $BASE"

curl -b jar -X POST "$BASE/api/processes/$PID/chat" -H "content-type: application/json" \
  -H "origin: $BASE" -d '{"question":"Quais alegações não têm prova?"}' | jq '.citations'

curl -b jar -X POST "$BASE/api/reports" -H "content-type: application/json" \
  -H "origin: $BASE" -d "{\"processId\":\"$PID\",\"type\":\"risk\",\"format\":\"pdf\"}" \
  -o relatorio.pdf
```
