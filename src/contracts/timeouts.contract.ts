// How long the screens wait for the calls whose server work can take longer than the default
// CLIENT_REQUEST_TIMEOUT_MS of the shared API client. Each value covers the worst case of the
// server side of that call, which composition/timing-budget.ts computes from the adapters'
// timeouts and retries; timing-budget.spec.ts fails when a value no longer covers it with
// CLIENT_TIMEOUT_MARGIN_MS to spare (docs/architecture/project-setup.md section 10.4).

/** Time the browser, the network and the database need on top of the server's worst case. */
export const CLIENT_TIMEOUT_MARGIN_MS = 5000;
/** POST /api/settings/guard/test: one topic guard call with its retry. */
export const CLIENT_TIMEOUT_GUARD_TEST_MS = 30_000;
/** POST /api/settings/rich-menu: create, upload, set the default, then delete one menu (or two). */
export const CLIENT_TIMEOUT_RICH_MENU_PUBLISH_MS = 120_000;
/** DELETE /api/settings/rich-menu: clear the default, then delete the menu. */
export const CLIENT_TIMEOUT_RICH_MENU_REMOVE_MS = 60_000;
/** PUT /api/settings/line-credentials and POST /api/settings/line/test. */
export const CLIENT_TIMEOUT_LINE_CHECK_MS = 50_000;
/**
 * Multipart uploads (POST /api/knowledge/documents and its retry): the default plus the time
 * the file takes at this slowest rate a working connection is expected to keep (256 kbit/s).
 */
export const CLIENT_UPLOAD_MIN_BYTES_PER_SECOND = 32 * 1024;
