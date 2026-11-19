// Calls of the access gate (ui-screens 1.6). Both go through `apiFetch`, so a failure is an
// `ApiError` like every other call of the screens.
import { ApiError, apiFetchNoContent } from '@/common/common.api';
import { unlockBodySchema } from '@/contracts';

export { lock } from '@/common/common.api';

/** POST /api/access/unlock. Resolves on 204; throws `ApiError` otherwise. */
export async function unlock(code: string): Promise<void> {
  const body = unlockBodySchema.safeParse({ code });
  // Too long for the server to accept: same answer the server would give, without the trip.
  if (!body.success) throw new ApiError('request.invalid', 400);
  await apiFetchNoContent('/api/access/unlock', { method: 'POST', body: body.data });
}
