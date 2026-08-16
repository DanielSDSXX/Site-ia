import { handle, parseJson } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { reportSchema } from '@/lib/validation';
import { generateReport } from '@/server/reports';
import { audit } from '@/lib/audit';

/**
 * Gera e devolve o relatório diretamente no corpo da resposta.
 *
 * O arquivo não é persistido no storage por padrão: relatórios são derivados
 * do banco e podem ser regerados, e guardar cópias de documentos sensíveis sem
 * necessidade aumenta a superfície de exposição.
 */
export async function POST(request: Request) {
  return handle(request, 'reports.generate', async () => {
    const ctx = await requirePermission('report:generate');
    const input = await parseJson(request, reportSchema);

    const { buffer, filename, contentType } = await generateReport(
      ctx.organization.id,
      input.processId,
      input.type,
      input.format,
    );

    await audit({
      action: 'report.generate',
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      resourceType: 'process',
      resourceId: input.processId,
      metadata: { type: input.type, format: input.format },
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': contentType,
        'content-length': String(buffer.byteLength),
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    });
  });
}
