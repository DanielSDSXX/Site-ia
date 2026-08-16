'use client';

/**
 * Cliente HTTP do frontend.
 *
 * Padroniza duas coisas: o cabeçalho que identifica requisições da própria
 * aplicação e a extração da mensagem de erro amigável que a API devolve —
 * nunca exibimos texto técnico ao usuário.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; code?: string };

const GENERIC = 'Não conseguimos concluir a operação. Tente novamente em instantes.';

async function request<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'x-requested-with': 'legalmind',
        ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
      credentials: 'same-origin',
    });

    if (response.status === 204) return { ok: true, data: undefined as T };

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string; code?: string } } | null)?.error?.message ?? GENERIC;
      const code = (payload as { error?: { code?: string } } | null)?.error?.code;
      return { ok: false, message, code };
    }

    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, message: 'Falha de conexão. Verifique sua internet e tente novamente.' };
  }
}

export function apiGet<T>(url: string) {
  return request<T>(url, { method: 'GET' });
}

export function apiPost<T>(url: string, body?: unknown) {
  return request<T>(url, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  });
}

export function apiPatch<T>(url: string, body?: unknown) {
  return request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
}

export function apiPut<T>(url: string, body?: unknown) {
  return request<T>(url, { method: 'PUT', body: JSON.stringify(body ?? {}) });
}

export function apiDelete<T>(url: string) {
  return request<T>(url, { method: 'DELETE' });
}

/** Baixa um arquivo gerado por um endpoint POST (relatórios). */
export async function downloadFromPost(
  url: string,
  body: unknown,
  fallbackName: string,
): Promise<ApiResult<void>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'legalmind' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return {
        ok: false,
        message:
          (payload as { error?: { message?: string } } | null)?.error?.message ?? GENERIC,
      };
    }

    const disposition = response.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = match?.[1] ?? fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    return { ok: true, data: undefined };
  } catch {
    return { ok: false, message: 'Falha ao gerar o arquivo. Tente novamente.' };
  }
}
