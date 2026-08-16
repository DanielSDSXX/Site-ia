#!/usr/bin/env node
/**
 * Diagnóstico da integração com a API Pública do DataJud (CNJ).
 *
 * Rode no SEU terminal, onde a rede alcança o CNJ:
 *
 *   node scripts/datajud-doctor.mjs                        # usa o índice do .env
 *   node scripts/datajud-doctor.mjs tjsp "execução fiscal"
 *   node scripts/datajud-doctor.mjs tjgo 0000832-35.2018.4.01.3202
 *
 * O script mostra exatamente o que foi enviado e o que voltou — inclusive o
 * corpo do erro do Elasticsearch, que é onde costuma estar a resposta de
 * verdade. Ele não passa pela aplicação nem pelo banco: é só HTTP.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- .env (sem dependência externa) -----------------------------------------
function loadEnvFile(file) {
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = { ...loadEnvFile('.env.local'), ...loadEnvFile('.env') };
const cfg = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;

const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').toLowerCase());

// --- Configuração ------------------------------------------------------------
const baseUrl = (cfg('DATAJUD_BASE_URL', 'https://api-publica.datajud.cnj.jus.br') || '').replace(
  /\/+$/,
  '',
);
const apiKey = cfg('DATAJUD_API_KEY', '');
const enabled = truthy(cfg('DATAJUD_ENABLED', 'false'));
const defaultIndex = cfg('DATAJUD_TRIBUNAL_INDEX', 'api_publica_tjgo');

const [courtArg, ...queryParts] = process.argv.slice(2);
const rawCourt = (courtArg ?? '').trim();
const index = !rawCourt
  ? defaultIndex
  : rawCourt.startsWith('api_publica_')
    ? rawCourt.toLowerCase()
    : `api_publica_${rawCourt.toLowerCase()}`;
const query = queryParts.join(' ').trim() || 'execução fiscal';

const digits = query.replace(/\D/g, '');
const cnj = digits.length === 20 ? digits : null;

// Mesmo corpo que a aplicação monta (src/lib/integrations/datajud.ts).
// Repare: `index` NÃO vai aqui. O índice vai na URL.
const chronological = { '@timestamp': { order: 'asc', unmapped_type: 'date' } };

const body = cnj
  ? {
      size: 5,
      _source: true,
      query: { match: { numeroProcesso: cnj } },
      sort: [chronological],
    }
  : {
      size: 5,
      _source: true,
      query: {
        bool: {
          should: [
            { match: { 'classe.nome': { query, fuzziness: 'AUTO' } } },
            { match: { 'assuntos.nome': { query, fuzziness: 'AUTO' } } },
            { match: { 'orgaoJulgador.nome': { query, fuzziness: 'AUTO' } } },
            { match: { 'movimentos.nome': { query, fuzziness: 'AUTO' } } },
            { match: { tribunal: query } },
          ],
          minimum_should_match: 1,
        },
      },
      sort: [{ _score: { order: 'desc' } }, chronological],
    };

const url = `${baseUrl}/${index}/_search`;
const line = (s = '') => process.stdout.write(`${s}\n`);
const rule = () => line('─'.repeat(72));

rule();
line('DataJud — diagnóstico');
rule();
line(`DATAJUD_ENABLED        ${enabled ? 'true' : 'false'}`);
line(
  `DATAJUD_API_KEY        ${
    apiKey ? `definida (${apiKey.length} caracteres, termina em …${apiKey.slice(-6)})` : 'AUSENTE'
  }`,
);
line(`DATAJUD_BASE_URL       ${baseUrl}`);
line(`Índice consultado      ${index}${rawCourt ? '' : '  (padrão do .env)'}`);
line(`Consulta               ${cnj ? `número CNJ ${cnj}` : `texto "${query}"`}`);
line(`URL                    POST ${url}`);
rule();
line('Corpo enviado:');
line(JSON.stringify(body, null, 2));
rule();

if (!apiKey) {
  line('');
  line('✗ Sem DATAJUD_API_KEY não há o que testar.');
  line('  A chave pública é divulgada pelo próprio CNJ em:');
  line('  https://datajud-wiki.cnj.jus.br/api-publica/acesso');
  line('  Informe-a no .env SEM o prefixo "APIKey".');
  process.exit(1);
}

if (!enabled) {
  line('');
  line('⚠ DATAJUD_ENABLED=false — a aplicação não vai consultar o DataJud.');
  line('  Este teste roda mesmo assim, para isolar rede/chave de configuração.');
  rule();
}

const started = Date.now();
let response;
try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `APIKey ${apiKey}` },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
} catch (err) {
  line('');
  line(`✗ A requisição falhou antes de qualquer resposta (${Date.now() - started} ms).`);
  line(`  ${err?.name === 'AbortError' ? 'Tempo esgotado (20s).' : String(err?.message ?? err)}`);
  line('');
  line('  Causas comuns: sem saída para a internet, proxy corporativo bloqueando');
  line('  api-publica.datajud.cnj.jus.br, ou DNS.');
  process.exit(1);
}

const elapsed = Date.now() - started;
const text = await response.text();

line('');
line(`HTTP ${response.status} ${response.statusText}  (${elapsed} ms)`);
rule();

if (!response.ok) {
  line('Resposta de erro (bruta, como veio do CNJ):');
  line(text.slice(0, 4000));
  rule();
  if (response.status === 401 || response.status === 403) {
    line('→ A chave foi recusada. Confira DATAJUD_API_KEY e o prefixo do cabeçalho.');
  } else if (response.status === 404) {
    line(`→ O índice "${index}" não existe. Confira a sigla do tribunal.`);
  } else if (response.status === 400) {
    line('→ Corpo da consulta rejeitado. Se aparecer "parsing_exception" com');
    line('  "unknown key [index]", há um `index` sendo enviado no corpo.');
  } else if (response.status === 429) {
    line('→ Limite de requisições atingido. Aguarde antes de repetir.');
  }
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(text);
} catch {
  line('✗ A resposta veio 200 mas não é JSON válido:');
  line(text.slice(0, 1000));
  process.exit(1);
}

const hits = payload?.hits?.hits ?? [];
const total = typeof payload?.hits?.total === 'number' ? payload.hits.total : payload?.hits?.total?.value;

line(`Total de processos encontrados: ${total ?? hits.length}`);
line(`Retornados nesta página:        ${hits.length}`);
rule();

if (hits.length === 0) {
  line('A consulta funcionou, mas não encontrou nada neste índice.');
  line('Tente outro tribunal ou um número CNJ que você sabe que existe lá.');
  process.exit(0);
}

for (const hit of hits) {
  const s = hit._source ?? {};
  line('');
  line(`• ${s.numeroProcesso ?? '(sem número)'}   [${hit._index ?? index}]`);
  line(`  Classe .......... ${s.classe?.nome ?? '—'}`);
  line(`  Assuntos ........ ${(s.assuntos ?? []).map((a) => a?.nome).filter(Boolean).join(', ') || '—'}`);
  line(`  Órgão julgador .. ${s.orgaoJulgador?.nome ?? '—'}`);
  line(`  Grau ............ ${s.grau ?? '—'}`);
  line(`  Ajuizamento ..... ${s.dataAjuizamento ?? '—'}`);
  line(`  Movimentações ... ${(s.movimentos ?? []).length}`);
}

rule();
line('Campos presentes no primeiro _source:');
line(`  ${Object.keys(hits[0]._source ?? {}).join(', ')}`);
line('');
line('Repare que não há "ementa", "relator" nem "textoIntegral": o DataJud');
line('publica dados processuais, não o inteiro teor das decisões. É por isso');
line('que ele alimenta a aba "Consulta processual" e a linha do tempo, e não');
line('o acervo de jurisprudência, que exige ementa e link verificável.');
rule();
