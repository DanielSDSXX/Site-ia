import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/env';
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

/** Provedor OpenAI (Chat Completions), via fetch. */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly isDemo = false;
  readonly defaultModel: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.defaultModel = model || 'gpt-4.1-mini';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const response = await fetch(`${env().OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: request.system },
          ...request.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIProviderError(`OpenAI respondeu ${response.status}`, detail.slice(0, 500));
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) throw new AIProviderError('Resposta vazia do provedor OpenAI.');

    return {
      text,
      model: data.model ?? model,
      provider: this.name,
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(request.system),
      outputTokens: data.usage?.completion_tokens ?? estimateTokens(text),
    };
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly isDemo = false;
  readonly model: string;
  readonly dimensions = VECTOR_DIMENSIONS;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || 'text-embedding-3-small';
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { vectors: [], model: this.model, provider: this.name, inputTokens: 0 };
    }

    const response = await fetch(`${env().OPENAI_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: VECTOR_DIMENSIONS }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIProviderError(`OpenAI embeddings respondeu ${response.status}`, detail.slice(0, 500));
    }

    const data = (await response.json()) as {
      data?: { embedding: number[]; index: number }[];
      usage?: { prompt_tokens?: number };
    };

    const sorted = (data.data ?? []).sort((a, b) => a.index - b.index);
    return {
      vectors: sorted.map((d) => normalizeVector(d.embedding)),
      model: this.model,
      provider: this.name,
      inputTokens: data.usage?.prompt_tokens ?? texts.reduce((sum, t) => sum + estimateTokens(t), 0),
    };
  }
}
