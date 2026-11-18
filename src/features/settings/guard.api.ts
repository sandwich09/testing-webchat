// API functions of the topic guard section and the Guardrails panel (ui-screens 1.6).
import { apiFetch } from '@/common/common.api';
import {
  guardrailStatsResponseSchema,
  testTopicGuardResponseSchema,
  type GuardrailStatsDto,
  type TestTopicGuardResponse,
} from '@/contracts';

export type GuardTestResult = TestTopicGuardResponse;

/** POST /api/settings/guard/test. The server checks the text against the saved topics. */
export function testTopicGuard(text: string): Promise<GuardTestResult> {
  return apiFetch('/api/settings/guard/test', {
    method: 'POST',
    body: { text },
    schema: testTopicGuardResponseSchema,
  });
}

/** GET /api/system/guardrails */
export function getGuardrailStats(signal?: AbortSignal): Promise<GuardrailStatsDto> {
  return apiFetch('/api/system/guardrails', { schema: guardrailStatsResponseSchema, signal });
}
