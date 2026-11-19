// API functions of the topic guard section (ui-screens 1.6).
import { apiFetch } from '@/common/common.api';
import {
  CLIENT_TIMEOUT_GUARD_TEST_MS,
  testTopicGuardResponseSchema,
  type TestTopicGuardResponse,
} from '@/contracts';

export type GuardTestResult = TestTopicGuardResponse;

/** POST /api/settings/guard/test. The server checks the text against the saved topics. */
export function testTopicGuard(text: string): Promise<GuardTestResult> {
  return apiFetch('/api/settings/guard/test', {
    method: 'POST',
    body: { text },
    schema: testTopicGuardResponseSchema,
    timeoutMs: CLIENT_TIMEOUT_GUARD_TEST_MS,
  });
}
