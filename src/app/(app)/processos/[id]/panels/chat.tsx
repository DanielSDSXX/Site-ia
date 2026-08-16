'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, ConfidenceBadge, DemoNotice, ErrorNotice, Spinner } from '@/components/ui';
import { CitationChip } from '@/components/evidence-viewer';
import { apiGet, apiPost } from '@/lib/client/api-client';
import { cn } from '@/lib/utils';
import { IconChat, IconSpark } from '@/components/icons';

interface Citation {
  ref: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  quote: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: string | null;
  citations: Citation[];
}

const SUGGESTED_QUESTIONS = [
  'Explique este processo em 30 segundos.',
  'Quais são os três maiores riscos?',
  'Quais alegações ainda não têm prova nos autos?',
  'A contestação enfrentou todos os pedidos?',
  'Quais documentos eu deveria ler primeiro?',
  'Explique este processo para o cliente.',
];

/**
 * Chat contextual do processo.
 *
 * As respostas trazem as fontes usadas; clicar numa fonte abre o documento na
 * página exata. Referências que não existem no contexto recuperado são
 * removidas no servidor antes de a mensagem chegar aqui.
 */
export function ChatPanel({
  processId,
  enabled,
  demoAI,
}: {
  processId: string;
  enabled: boolean;
  demoAI: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [verbosity, setVerbosity] = useState<'short' | 'detailed'>('detailed');
  const [useOrgMemory, setUseOrgMemory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2 || loading) return;

    setError(null);
    setQuestion('');
    setMessages((current) => [
      ...current,
      { id: `local-${Date.now()}`, role: 'user', content: trimmed, citations: [] },
    ]);
    setLoading(true);

    const response = await apiPost<{
      threadId: string;
      messageId: string;
      content: string;
      confidence: string;
      citations: Citation[];
    }>(`/api/processes/${processId}/chat`, {
      question: trimmed,
      threadId,
      verbosity,
      useOrgMemory,
    });

    setLoading(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }

    setThreadId(response.data.threadId);
    setMessages((current) => [
      ...current,
      {
        id: response.data.messageId,
        role: 'assistant',
        content: response.data.content,
        confidence: response.data.confidence,
        citations: response.data.citations,
      },
    ]);
  };

  const clearConversation = async () => {
    if (threadId) await apiGet(`/api/processes/${processId}/chat`);
    setMessages([]);
    setThreadId(null);
  };

  if (!enabled) {
    return (
      <div className="rounded-xl border border-[var(--border)] p-8 text-center text-[13.5px] text-[var(--text-muted)]">
        Seu perfil não tem permissão para usar o chat deste processo.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-22rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <IconChat className="size-4 text-[var(--text-muted)]" />
        <p className="mr-auto text-[13.5px] font-medium">Chat do processo</p>

        <div className="flex rounded-lg border border-[var(--border)] p-0.5">
          {(['short', 'detailed'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setVerbosity(mode)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11.5px] transition-colors',
                verbosity === mode
                  ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                  : 'text-[var(--text-muted)]',
              )}
            >
              {mode === 'short' ? 'Resposta curta' : 'Resposta detalhada'}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={useOrgMemory}
            onChange={(event) => setUseOrgMemory(event.target.checked)}
            className="size-3.5 accent-[var(--accent)]"
          />
          Memória do escritório
        </label>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearConversation}
            className="text-[11.5px] text-[var(--text-subtle)] hover:text-[var(--risk-critical)]"
          >
            Limpar conversa
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {demoAI && (
          <div className="mb-5">
            <DemoNotice compact />
          </div>
        )}

        {messages.length === 0 && (
          <div className="py-6">
            <p className="text-[13.5px] text-[var(--text-muted)]">
              Pergunte qualquer coisa sobre este processo. As respostas usam apenas os trechos
              recuperados dos documentos enviados, e cada afirmação vem com a fonte.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-2.5 text-[13.5px] leading-relaxed text-[var(--accent-fg)]">
                  {message.content}
                </p>
              </div>
            ) : (
              <div key={message.id} className="max-w-[92%]">
                <div className="flex items-center gap-2">
                  <IconSpark className="size-3.5 text-[var(--accent)]" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    Resposta
                  </span>
                  <ConfidenceBadge confidence={message.confidence} />
                </div>

                <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed">
                  {message.content}
                </p>

                {message.citations.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      Fontes utilizadas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {message.citations.map((citation) => (
                        <CitationChip
                          key={citation.ref}
                          citation={{
                            documentId: citation.documentId,
                            pageNumber: citation.pageNumber,
                            quote: citation.quote,
                            document: { title: citation.documentTitle },
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ),
          )}

          {loading && (
            <p className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
              <Spinner className="size-4" />
              Consultando os documentos do processo…
            </p>
          )}
        </div>

        {error && (
          <div className="mt-4">
            <ErrorNotice>{error}</ErrorNotice>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        className="flex shrink-0 gap-2 border-t border-[var(--border)] p-3"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Pergunte sobre este processo…"
          className="input"
          disabled={loading}
        />
        <Button type="submit" variant="primary" disabled={loading || question.trim().length < 2}>
          Perguntar
        </Button>
      </form>
    </div>
  );
}
