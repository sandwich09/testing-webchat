import type { CannedReply } from '@/core/domain';
import { ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type ListCannedRepliesInput = Record<string, never>;

export type ListCannedRepliesOutput = CannedReply[];

export type ListCannedRepliesDeps = Pick<AllPorts, 'cannedReplies'>;

export const makeListCannedReplies: (
  deps: ListCannedRepliesDeps,
  config: UseCaseConfig,
) => UseCase<ListCannedRepliesInput, ListCannedRepliesOutput> =
  ({ cannedReplies }) =>
  async () =>
    ok(await cannedReplies.list());
