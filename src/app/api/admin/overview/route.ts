import { handle, ok } from '@/lib/api';
import { requirePlatformAdmin } from '@/lib/auth/session';
import { dailyCostSeries, listOrganizations, platformOverview, recentErrors } from '@/server/admin';

export async function GET(request: Request) {
  return handle(request, 'admin.overview', async () => {
    await requirePlatformAdmin();

    const [overview, organizations, errors, series] = await Promise.all([
      platformOverview(),
      listOrganizations(),
      recentErrors(),
      dailyCostSeries(),
    ]);

    return ok({ overview, organizations, errors, series });
  });
}
