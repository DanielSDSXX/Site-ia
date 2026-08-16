import {
  estimateTokens,
  normalizeVector,
  type AIProvider,
  type CompletionRequest,
  type CompletionResponse,
  type EmbeddingProvider,
  type EmbeddingResult,
  VECTOR_DIMENSIONS,
} from '../types';
import { rankSentences, splitSentences, tokenize } from '@/lib/text/nlp';

export const DEMO_NOTICE =
  'Modo demonstração: nenhum modelo de linguagem está conectado. O texto abaixo foi ' +
  'selecionado literalmente dos documentos por um algoritmo de recuperação lexical — ' +
  'não houve raciocínio de IA generativa. Configure AI_PROVIDER e a chave de API para ' +
  'ativar a análise completa.';

/**
 * Provedor local — NÃO é um LLM.
 *
 * É um extrator determinístico: dado o contexto recuperado (blocos
 * `<trecho …>` montados por src/lib/rag/context.ts) e a pergunta do usuário,
 * devolve as passagens mais relevantes literalmente, sem gerar texto novo.
 *
 * Existe por dois motivos:
 *  1. permitir rodar e testar a plataforma inteira sem chave de API;
 *  2. garantir que "sem LLM" signifique "sem resposta inventada" em vez de
 *     um texto plausível produzido por heurística e apresentado como IA.
 *
 * Toda saída daqui carrega `isDemo = true` e é rotulada na interface.
 */
export class LocalExtractiveProvider implements AIProvider {
  readonly name = 'local';
  readonly isDemo = true;
  readonly defaultModel = 'local-extractive-v1';

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const question = lastUser?.content ?? '';
    const passages = extractPassages(question);

    if (passages.length === 0) {
      return this.respond(
        `${DEMO_NOTICE}\n\nNão foi possível identificar essa informação nos documentos disponíveis.`,
        request,
      );
    }

    const query = extractQuestion(question);
    const queryTokens = tokenize(query);

    const sentences = passages.flatMap((passage) =>
      splitSentences(passage.text).map((text) => ({ text, ref: passage.ref })),
    );

    const ranked = rankSentences(
      sentences.map((s) => s.text),
      queryTokens,
    )
      .filter((r) => r.score > 0)
      .slice(0, 6);

    if (ranked.length === 0) {
      return this.respond(
        `${DEMO_NOTICE}\n\nNão foi possível identificar essa informação nos documentos disponíveis. ` +
          `Foram recuperados ${passages.length} trecho(s), mas nenhum contém os termos da pergunta.`,
        request,
      );
    }

    const body = ranked
      .map((r) => {
        const source = sentences[r.index];
        return `- "${source.text.trim()}"\n  Fonte: ${source.ref}`;
      })
      .join('\n\n');

    return this.respond(
      `${DEMO_NOTICE}\n\nTrechos localizados nos documentos que respondem à sua pergunta:\n\n${body}`,
      request,
    );
  }

  private respond(text: string, request: CompletionRequest): CompletionResponse {
    return {
      text,
      model: this.defaultModel,
      provider: this.name,
      inputTokens: estimateTokens(request.system + request.messages.map((m) => m.content).join('')),
      outputTokens: estimateTokens(text),
    };
  }
}

interface Passage {
  ref: string;
  text: string;
}

const PASSAGE_RE = /<trecho\s+ref="([^"]+)"[^>]*>([\s\S]*?)<\/trecho>/g;

export function extractPassages(prompt: string): Passage[] {
  const out: Passage[] = [];
  for (const match of prompt.matchAll(PASSAGE_RE)) {
    out.push({ ref: match[1], text: match[2].trim() });
  }
  return out;
}

export function stripContextBlocks(prompt: string): string {
  return prompt.replace(PASSAGE_RE, ' ').replace(/<[^>]+>/g, ' ');
}

const QUESTION_RE = /<pergunta>([\s\S]*?)<\/pergunta>/;

/**
 * Isola a pergunta do usuário dentro da mensagem.
 *
 * Sem isto, o cabeçalho do prompt (número do processo, títulos dos documentos,
 * rótulos como "TRECHOS RECUPERADOS") entraria na consulta e casaria com o
 * próprio corpus — o extrator devolveria trechos irrelevantes em vez de
 * admitir que a informação não está nos autos. A tag é escrita pelo montador
 * de contexto em src/lib/intelligence/chat.ts.
 */
export function extractQuestion(prompt: string): string {
  const tagged = prompt.match(QUESTION_RE);
  if (tagged) return tagged[1].trim();
  return stripContextBlocks(prompt);
}

// ---------------------------------------------------------------------------
// Embeddings locais
// ---------------------------------------------------------------------------

/**
 * Embedding lexical determinístico (hashing trick).
 *
 * Projeta unigramas, bigramas e trigramas de caracteres num espaço de 1536
 * dimensões usando FNV-1a, com peso TF sublinear e normalização L2. Não
 * captura sinonímia como um modelo neural, mas é um vetor real, estável e
 * comparável por cosseno — suficiente para desenvolvimento offline e para
 * manter o pipeline de RAG funcionando sem chave de API.
 */
export class LocalHashingEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  readonly isDemo = true;
  readonly model = 'local-hashing-v1';
  readonly dimensions = VECTOR_DIMENSIONS;

  async embed(texts: string[]): Promise<EmbeddingResult> {
    return {
      vectors: texts.map((text) => embedLocal(text)),
      model: this.model,
      provider: this.name,
      inputTokens: texts.reduce((sum, t) => sum + estimateTokens(t), 0),
    };
  }
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function embedLocal(text: string, dimensions = VECTOR_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);

  const add = (feature: string, weight: number) => {
    const hash = fnv1a(feature);
    const index = hash % dimensions;
    // Bit de sinal derivado do hash: reduz colisões construtivas sistemáticas.
    const sign = (hash >>> 31) & 1 ? -1 : 1;
    vector[index] += sign * weight;
  };

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const [token, count] of counts) {
    add(`w:${token}`, 1 + Math.log(count));
  }

  for (let i = 0; i + 1 < tokens.length; i++) {
    add(`b:${tokens[i]}_${tokens[i + 1]}`, 0.6);
  }

  // Trigramas de caracteres: dão alguma tolerância a flexão e erro de digitação.
  const normalized = ` ${tokens.join(' ')} `;
  for (let i = 0; i + 3 <= normalized.length; i++) {
    add(`c:${normalized.slice(i, i + 3)}`, 0.25);
  }

  return normalizeVector(vector, dimensions);
}
