import type { AiUsageRecord, ContactId } from '@/core/domain';
import { ok, requireBangkokMonthRange } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type GetContactUsageInput = { contactId: ContactId; month: string };

export type GetContactUsageOutput = AiUsageRecord[];

export type GetContactUsageDeps = Pick<AllPorts, 'usage'>;

/** An unknown contact gives an empty list, not an error. */
export const makeGetContactUsage: (
  deps: GetContactUsageDeps,
  config: UseCaseConfig,
) => UseCase<GetContactUsageInput, GetContactUsageOutput> =
  ({ usage }) =>
  async ({ contactId, month }) =>
    ok(await usage.listForContact(contactId, requireBangkokMonthRange(month)));
