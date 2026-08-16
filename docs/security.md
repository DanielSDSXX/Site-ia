# Segurança e privacidade

Documentos jurídicos são dados sensíveis de terceiros. Este documento descreve as medidas
implementadas e — igualmente importante — o que **não** está coberto.

## Autenticação

- Senhas com **bcrypt, custo 12**. Nunca armazenadas nem registradas em claro.
- Política focada em comprimento (mínimo 10 caracteres, letra + número, sem palavras
  previsíveis), seguindo o NIST SP 800-63B em vez de exigir símbolos — regras de
  composição empurram o usuário para senhas piores.
- **Sessão opaca**: o cookie carrega um token aleatório de 256 bits; o banco guarda apenas
  o `SHA-256` dele. Um dump do banco não permite forjar sessão.
- Cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, expiração de 14 dias.
- Revogação real: logout e troca de senha marcam `revokedAt`; a verificação acontece a
  cada requisição.
- **Bloqueio progressivo**: 8 falhas bloqueiam a conta por 15 minutos.
- **Sem oráculo de existência de conta**: e-mail inexistente ainda executa uma verificação
  fictícia de senha, para não vazar contas por diferença de tempo de resposta.

## Autorização e multi-tenancy

Cinco perfis (OWNER, ADMIN, LAWYER, ASSISTANT, VIEWER) com matriz explícita em
`src/lib/auth/permissions.ts`. Rotas declaram a permissão exigida via
`requirePermission('analysis:run')`.

O isolamento entre escritórios é a garantia mais crítica:

- todo serviço recebe `organizationId` como parâmetro — nunca o infere;
- toda consulta filtra por ele, inclusive as buscas vetorial e full-text;
- recursos alheios respondem **404**, não 403 (403 confirmaria a existência);
- 14 testes de integração tentam ativamente o acesso cruzado em cada caminho: leitura,
  escrita, exclusão, download, RAG, chat, análise e busca global.

## Proteção de requisições

| Vetor | Medida |
| --- | --- |
| CSRF | `SameSite=Lax` + verificação de `Origin`/`Referer` em todo método que altera estado |
| XSS | React escapa por padrão; nenhum `dangerouslySetInnerHTML` com dado de usuário; CSP sem `unsafe-eval` |
| Clickjacking | `X-Frame-Options: DENY` e `frame-ancestors 'none'` |
| SQL injection | Prisma parametriza; o SQL bruto usa template tags parametrizadas. Vetores são serializados a partir de números validados, nunca de string do usuário |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Força bruta | Rate limit por janela fixa no banco (funciona com múltiplas instâncias, ao contrário de contador em memória) |
| Enumeração | Respostas e tempos uniformes no login |

CSP aplicada no middleware; cabeçalhos de segurança em `next.config.ts`.

## Upload

- Limite de tamanho configurável (padrão 50 MB) e lista branca de MIME.
- **Verificação de assinatura binária** (`%PDF`, `PK\x03\x04`, PNG, JPEG): o tipo
  informado pelo navegador é controlado pelo cliente, então um executável renomeado para
  `.pdf` é rejeitado antes de tocar o storage.
- Texto com bytes nulos é recusado (binário disfarçado).
- Deduplicação por SHA-256.
- PDFs são processados com `isEvalSupported: false` e sem carregar fontes do sistema.
- Não há antivírus embutido. Em ambiente com anexos de origem externa, coloque um
  scanner (ClamAV ou serviço equivalente) entre o upload e o storage — o ponto de
  extensão é `uploadDocument` em `src/server/documents.ts`.

## Documentos em repouso e em trânsito

- **Nenhum arquivo é servido estaticamente.** Não existe URL pública nem link assinado.
  O único caminho é `GET /api/documents/:id/content`, que valida sessão, organização e
  permissão a cada requisição.
- Respostas de documento vão com `Cache-Control: private, no-store` e
  `Content-Security-Policy: sandbox`, para que um PDF malicioso não execute script no
  contexto da aplicação.
- Criptografia em repouso opcional (**AES-256-GCM**) quando `STORAGE_ENCRYPTION_KEY` está
  definida. No S3, soma-se `ServerSideEncryption: AES256`.
- Chaves de storage são prefixadas por organização e sanitizadas contra path traversal.

## Auditoria

`audit_logs` registra login, falha de login, logout, troca de senha, criação e alteração
de escritório, mudanças de perfil, CRUD de clientes e processos, upload, download,
exclusão de documento, execução de análise, mensagens de chat, geração de relatório,
importação de jurisprudência, exportação e exclusão de conta.

Endereços IP são gravados **pseudonimizados** (hash com o segredo da aplicação): mantém
utilidade forense sem armazenar o dado pessoal em claro.

Falha ao gravar auditoria nunca derruba a operação do usuário — é registrada no log de
erros do servidor.

## Tratamento de erros

O usuário nunca vê stack trace nem mensagem interna. Erros `AppError` com `expose: true`
mostram a mensagem escrita para humanos; qualquer outra coisa vira *"Não conseguimos
concluir a operação. Tente novamente em instantes."* e é registrada com escopo e contexto
no servidor. A fronteira de erro da interface exibe apenas o `digest`, para correlação
com o log pelo suporte.

## Privacidade e LGPD

**Papéis.** O escritório é o controlador dos dados dos processos; a plataforma é
operadora.

**Minimização.** Cadastro de cliente com campos mínimos. CPF/CNPJ de partes só é
armazenado quando o usuário o informa explicitamente.

**IA e provedores externos.** Quando um provedor externo está configurado, apenas os
**trechos recuperados** para aquela operação são enviados — nunca o acervo completo.
A configuração *"seus documentos não serão utilizados para treinamento de modelos
externos"* expressa a instrução do controlador; o cumprimento efetivo depende dos termos
contratuais com o provedor escolhido. Com `AI_PROVIDER=local`, nada sai da instalação.

**Direitos do titular.** Exportação em JSON (`GET /api/account`) e exclusão de conta
(`DELETE /api/account`), que anonimiza o cadastro, revoga sessões e encerra o escritório
quando não há outro proprietário.

**Eliminação efetiva.** Excluir um documento remove o arquivo do storage e apaga os
trechos indexados — não apenas oculta da listagem.

### O que não está coberto

Não afirmamos adequação integral à LGPD. Não estão implementados: DPIA, registro formal
de consentimento granular por finalidade, política automatizada de retenção e descarte,
anonimização de dados em backups antigos, e acordos de operador com os provedores de
infraestrutura e IA. Esses itens dependem do contexto de uso de cada organização e de
auditoria especializada.

## Configuração de produção

Obrigatório:

```bash
NODE_ENV=production
SESSION_SECRET=$(openssl rand -base64 48)      # a aplicação recusa o valor padrão
STORAGE_ENCRYPTION_KEY=$(openssl rand -hex 32)
DATABASE_URL=postgresql://…?sslmode=require
APP_URL=https://seu-dominio            # usado na verificação de origem
RATE_LIMIT_ENABLED=true
```

Recomendado: HTTPS obrigatório (HSTS já vai nos cabeçalhos), usuário de banco sem
privilégios de superusuário, backup criptografado do storage **junto com a chave**,
rotação periódica de `SESSION_SECRET` (invalida todas as sessões), e worker em processo
separado com `QUEUE_INLINE_WORKER=false`.

## Reportar vulnerabilidade

Reporte de forma privada ao responsável pela instalação, com passos de reprodução. Não
abra issue pública com detalhes exploráveis.
