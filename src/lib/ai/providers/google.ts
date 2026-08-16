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

/** Provedor Google (Gemini generateContent), via fetch. */
export class GoogleProvider implements AIProvider {
  readonly name = 'google';
  readonly isDemo = false;
  readonly defaultModel: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.defaultModel = model || 'gemini-2.5-flash';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${env().GOOGLE_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: request.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxTokens ?? 4096,
          ...(request.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIProviderError(`Google respondeu ${response.status}`, detail.slice(0, 500));
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? '';
    if (!text) throw new AIProviderError('Resposta vazia do provedor Google.');

    return {
      text,
      model,
      provider: this.name,
      inputTokens: data.usageMetadata?.promptTokenCount ?? estimateTokens(request.system),
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? estimateTokens(text),
    };
  }
}

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'google';
  readonly isDemo = false;
  readonly model: string;
  readonly dimensions = VECTOR_DIMENSIONS;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.model = model || 'text-embedding-004';
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { vectors: [], model: this.model, provider: this.name, inputTokens: 0 };
    }

    const url = `${env().GOOGLE_BASE_URL}/models/${encodeURIComponent(this.model)}:batchEmbedContents`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
        })),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIProviderError(`Google embeddings respondeu ${response.status}`, detail.slice(0, 500));
    }

    const data = (await response.json()) as { embeddings?: { values: number[] }[] };
    return {
      vectors: (data.embeddings ?? []).map((e) => normalizeVector(e.values)),
      model: this.model,
      provider: this.name,
      inputTokens: texts.reduce((sum, t) => sum + estimateTokens(t), 0),
    };
  }
}
