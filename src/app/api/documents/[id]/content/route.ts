import { handle } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { getDocumentContent } from '@/server/documents';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/**
 * Download / visualização do arquivo original.
 *
 * Este é o ÚNICO caminho de acesso ao conteúdo de um documento. Não existe URL
 * pública nem link assinado: cada requisição valida sessão, organização e
 * permissão, e fica registrada na auditoria.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(request, 'documents.content', async () => {
    const ctx = await requirePermission('document:read');
    const { id } = await params;

    const { document, buffer } = await getDocumentContent(ctx.organization.id, id);
    const url = new URL(request.url);
    const download = url.searchParams.get('download') === '1';

    if (download) {
      await audit({
        action: 'document.download',
        userId: ctx.user.id,
        organizationId: ctx.organization.id,
        resourceType: 'document',
        resourceId: id,
      });
    }

    const filename = document.originalFilename.replace(/["\r\n]/g, '');

    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': document.mimeType,
        'content-length': String(buffer.byteLength),
        'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        // Documentos são sensíveis: nada de cache compartilhado.
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        // Impede que um PDF malicioso execute scripts no contexto da aplicação.
        'content-security-policy': "default-src 'none'; object-src 'none'; sandbox",
      },
    });
  });
}
