import {
  getSettings,
  json,
  toSettingsDto,
  toUpdateSettingsInput,
  updateSettings,
  withRoute,
} from '@/composition';
import { updateSettingsBodySchema } from '@/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/settings';

export const GET = withRoute({ route, access: 'cookie' }, async ({ ctx }) => {
  const r = await getSettings({}, ctx);
  if (!r.ok) return r;
  return json(toSettingsDto(r.value));
});

export const PATCH = withRoute(
  { route, access: 'cookie', body: updateSettingsBodySchema },
  async ({ body, ctx }) => {
    const input = toUpdateSettingsInput(body);
    if (!input.ok) return input;
    const r = await updateSettings(input.value, ctx);
    if (!r.ok) return r;
    // UpdateSettings returns `Settings`, but SettingsDto also needs webhookUrl, todayCost,
    // guardBlockedToday and pollIntervalMs, which only GetSettings provides, so the answer is the
    // settings read again (api-contract PATCH /api/settings).
    const fresh = await getSettings({}, ctx);
    if (!fresh.ok) return fresh;
    return json(toSettingsDto(fresh.value));
  },
);
