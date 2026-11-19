/**
 * Fake LINE credentials shared by the Docker seed, the stub server and the E2E helpers
 * (docs/qa/stubs-and-fixtures.md section 2). Both values are obviously fake on purpose.
 */
export const STUB_CHANNEL_SECRET = 'stub-channel-secret';
export const STUB_CHANNEL_ACCESS_TOKEN = 'stub-access-token';
/** Channel ID whose channel secret is STUB_CHANNEL_SECRET (the stub's client-credentials route). */
export const STUB_CHANNEL_ID = '1000000000';
