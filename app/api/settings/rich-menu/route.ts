import {
  getSettings,
  json,
  publishRichMenu,
  removeRichMenu,
  toSettingsDto,
  withRoute,
} from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const route = '/api/settings/rich-menu';

/** Both answer the settings read again, so the screen shows the stored menu and error. */
const settingsResponse = async (ctx: Parameters<typeof getSettings>[1]) => {
  const fresh = await getSettings({}, ctx);
  if (!fresh.ok) return fresh;
  return json(toSettingsDto(fresh.value));
};

/** "Publish rich menu": PublishRichMenu. */
export const POST = withRoute({ route, access: 'cookie' }, async ({ ctx }) => {
  const r = await publishRichMenu({}, ctx);
  if (!r.ok) return r;
  return settingsResponse(ctx);
});

/** "นำ rich menu ออก": RemoveRichMenu. */
export const DELETE = withRoute({ route, access: 'cookie' }, async ({ ctx }) => {
  const r = await removeRichMenu({}, ctx);
  if (!r.ok) return r;
  return settingsResponse(ctx);
});
