import {
  readWebhookBody,
  receiveLineEvents,
  scheduleLineFollowUps,
  json,
  withRoute,
} from '@/composition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // WEBHOOK_MAX_DURATION_S

export const POST = withRoute(
  { route: '/api/line/webhook', access: 'webhook' },
  async ({ request, ctx }) => {
    const raw = await readWebhookBody(request);
    if (!raw.ok) return raw;
    const r = await receiveLineEvents(
      { rawBody: raw.value, signature: request.headers.get('x-line-signature') },
      ctx,
    );
    if (!r.ok) return r;
    scheduleLineFollowUps(r.value.followUps, ctx);
    return json({});
  },
);
