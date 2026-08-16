import { AIProviderError } from '@/lib/errors';
import { env } from '@/lib/env';
import { estimateTokens, type AIProvider, type CompletionRequest, type CompletionResponse } from '../types';

/**
 * Provedor Anthropic (Messages API), via fetch.
 *
 * Evitamos o SDK oficial de propósito: a chamada é uma requisição HTTP simples
 * e manter os provedores sem dependências pesadas facilita trocar de
 * fornecedor sem mexer no resto da aplicação.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly isDemo = false;
  readonly defaultModel: string;

  constructor(
    private readonly apiKey: string,
    model?: string,
  ) {
    this.defaultModel = model || 'claude-sonnet-4-5';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const system = request.json
      ? `${request.system}\n\nResponda EXCLUSIVAMENTE com um objeto JSON válido, sem texto antes ou depois, sem cercas de código.`
      : request.system;

    const response = await fetch(`${env().ANTHROPIC_BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.2,
        system,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AIProviderError(`Anthropic respondeu ${response.status}`, detail.slice(0, 500));
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };

    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('\n')
      .trim();

    if (!text) throw new AIProviderError('Resposta vazia do provedor Anthropic.');

    return {
      text,
      model: data.model ?? model,
      provider: this.name,
      inputTokens: data.usage?.input_tokens ?? estimateTokens(system + JSON.stringify(request.messages)),
      outputTokens: data.usage?.output_tokens ?? estimateTokens(text),
    };
  }
}
