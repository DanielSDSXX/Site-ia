# Instalação e deploy

## Desenvolvimento local

### Requisitos

- Node 20.11+
- PostgreSQL 14+ com **pgvector**
- Opcional: `tesseract-ocr` + `poppler-utils` para OCR

### PostgreSQL com pgvector

```bash
# Debian/Ubuntu
sudo apt-get install postgresql-16 postgresql-16-pgvector

# macOS
brew install postgresql@16 pgvector

# Docker
docker run -d --name legalmind-db -p 5432:5432 \
  -e POSTGRES_USER=legalmind -e POSTGRES_PASSWORD=legalmind \
  -e POSTGRES_DB=legalmind pgvector/pgvector:pg16
```

Crie os bancos (o de teste é obrigatório apenas para `npm run test:integration`):

```sql
CREATE USER legalmind WITH PASSWORD 'legalmind';
CREATE DATABASE legalmind OWNER legalmind;
CREATE DATABASE legalmind_test OWNER legalmind;
```

A extensão é criada pela própria migração.

### Aplicação

```bash
npm install
cp .env.example .env
# ajuste DATABASE_URL e gere SESSION_SECRET: openssl rand -base64 48

npm run db:deploy
npm run db:seed
npm run dev
```

`http://localhost:3000` · credenciais impressas pelo seed
(`demo@legalmind.local` / `legalmind-demo-2026`).

### OCR (opcional)

```bash
sudo apt-get install tesseract-ocr tesseract-ocr-por poppler-utils
```

```bash
OCR_PROVIDER=tesseract
OCR_LANG=por
OCR_MAX_PAGES=50
```

Sem OCR, páginas digitalizadas ficam marcadas como não lidas e a interface informa
quantas ficaram fora da análise. Configurações → IA e infraestrutura mostra se os
binários foram encontrados.

---

## Produção

### Variáveis obrigatórias

```bash
NODE_ENV=production
APP_URL=https://app.seudominio.com.br
SESSION_SECRET=<openssl rand -base64 48>       # a app recusa iniciar com o padrão
DATABASE_URL=postgresql://user:senha@host:5432/legalmind?sslmode=require
STORAGE_ENCRYPTION_KEY=<openssl rand -hex 32>
RATE_LIMIT_ENABLED=true
```

### IA

```bash
AI_PROVIDER=anthropic            # anthropic | openai | google | local
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-5       # opcional

EMBEDDING_PROVIDER=openai        # openai | google | local
OPENAI_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
```

Sem chave, a plataforma cai no provedor local e rotula tudo como *modo demonstração*.
Trocar o modelo de embeddings **exige reindexar** — ver [`database.md`](database.md).

### Armazenamento

```bash
STORAGE_DRIVER=s3
S3_BUCKET=legalmind-documentos
S3_REGION=sa-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# Provedores não-AWS (R2, MinIO):
S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=true
```

O bucket deve ser **privado**. A aplicação nunca emite URL pública nem pre-signed.

### Migrações

```bash
npm run db:deploy    # nunca `migrate dev` em produção
```

### Processos

```bash
npm run build

# 1) Web — worker desligado
QUEUE_INLINE_WORKER=false npm start

# 2) Worker dedicado
QUEUE_CONCURRENCY=4 npm run worker
```

Em deploy single-node, `QUEUE_INLINE_WORKER=true` dispensa o segundo processo.

#### systemd

```ini
# /etc/systemd/system/legalmind-worker.service
[Unit]
Description=LegalMind AI worker
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/legalmind
EnvironmentFile=/opt/legalmind/.env
Environment=QUEUE_INLINE_WORKER=false
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

#### Docker Compose

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: legalmind
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: legalmind
    volumes: [db-data:/var/lib/postgresql/data]

  web:
    build: .
    command: sh -c "npm run db:deploy && npm start"
    environment:
      QUEUE_INLINE_WORKER: "false"
    env_file: .env
    ports: ["3000:3000"]
    depends_on: [db]

  worker:
    build: .
    command: npm run worker
    environment:
      QUEUE_INLINE_WORKER: "true"
      QUEUE_CONCURRENCY: "4"
    env_file: .env
    depends_on: [db]

volumes:
  db-data:
```

### Plataformas serverless (Vercel e similares)

Funciona com duas ressalvas:

1. **Storage local não persiste.** Use `STORAGE_DRIVER=s3`.
2. **Worker embutido não é confiável** — a função pode ser congelada no meio de um job.
   Rode o worker num serviço com processo contínuo (Railway, Fly.io, uma VM) apontando
   para o mesmo banco, e mantenha `QUEUE_INLINE_WORKER=false` no web.

Ajuste também o limite de corpo da requisição do provedor para o valor de
`MAX_UPLOAD_MB`.

---

## Operação

### Adicionar alguém a um escritório

O envio de convite por e-mail é uma integração futura. Hoje o fluxo é: a pessoa cria a
própria conta em `/criar-conta` e um administrador a associa ao escritório:

```sql
INSERT INTO memberships ("id", "userId", "organizationId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u.id, o.id, 'LAWYER', NOW(), NOW()
FROM users u, organizations o
WHERE u.email = 'novo@escritorio.com.br' AND o.slug = 'meu-escritorio';
```

Depois disso, o perfil pode ser ajustado pela tela de Equipe.

### Promover um administrador de plataforma

```sql
UPDATE users SET "isPlatformAdmin" = true WHERE email = 'admin@suaempresa.com.br';
```

Dá acesso a `/admin` — a única área que cruza organizações.

### Monitoramento

- `Configurações → IA e infraestrutura`: provedores ativos, criptografia, OCR, estado do
  índice vetorial.
- `/admin`: organizações, consumo, custo de IA por dia/organização/funcionalidade e jobs
  com falha.
- Logs de erro saem em JSON de linha única com prefixo `[legalmind]`.

```sql
-- Fila
SELECT status, type, count(*) FROM jobs GROUP BY 1, 2;

-- Documentos travados
SELECT id, title, status, "processingError" FROM documents
WHERE status NOT IN ('INDEXED', 'FAILED') AND "createdAt" < NOW() - INTERVAL '1 hour';

-- Trechos sem embedding
SELECT count(*) FROM document_chunks WHERE "embeddedAt" IS NULL;
```

### Manutenção

O worker enfileira `maintenance.prune` a cada hora: remove janelas de rate limit
expiradas, jobs concluídos há mais de 7 dias e sessões expiradas há mais de 30.

### Backup

```bash
pg_dump --format=custom --file=legalmind-$(date +%F).dump "$DATABASE_URL"
aws s3 sync s3://legalmind-documentos ./backup-documentos   # ou o volume local
```

Guarde `STORAGE_ENCRYPTION_KEY` junto do backup dos arquivos: sem ela, os documentos são
irrecuperáveis.

---

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `type "vector" does not exist` | pgvector ausente | Instalar a extensão, ou usar `VECTOR_DRIVER=none` e remover os índices HNSW da migração |
| Documento parado em `PENDING` | Nenhum worker rodando | Subir `npm run worker` ou ligar `QUEUE_INLINE_WORKER` |
| `SESSION_SECRET padrão detectado` | Segredo de exemplo em produção | Gerar um real |
| Análise falha com `ai_bad_format` | Modelo devolveu JSON inválido | Ver `jobs.lastError`; modelos menores erram mais o formato JSON |
| Muitas páginas “sem texto” | PDF digitalizado sem OCR | Instalar tesseract e `OCR_PROVIDER=tesseract` |
| Busca semântica fraca | Embeddings locais | Configurar `EMBEDDING_PROVIDER=openai` e reindexar |
| 403 em toda escrita | `APP_URL` diferente do host servido | Ajustar `APP_URL` (verificação de origem) |
| Visualizador de PDF em branco | Worker do pdf.js ausente | `node scripts/copy-pdf-worker.mjs` (roda no `prebuild`) |
