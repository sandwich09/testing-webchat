import type { ErrorCode, NanoUsd } from '@/core/domain';
import { bangkokDayRange, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type GetSystemStatusInput = Record<string, never>;

export type GetSystemStatusOutput = {
  lastWebhookAt: Date | null;
  lastLineError: { code: ErrorCode; at: Date } | null;
  lastAiError: { code: ErrorCode; at: Date } | null;
  todayCost: NanoUsd;
  dailyBudget: NanoUsd;
  priceTableDate: string;
  database: 'ok';
};

export type GetSystemStatusDeps = Pick<AllPorts, 'settings' | 'usage' | 'clock'>;

export const makeGetSystemStatus: (
  deps: GetSystemStatusDeps,
  config: UseCaseConfig,
) => UseCase<GetSystemStatusInput, GetSystemStatusOutput> =
  ({ settings, usage, clock }, config) =>
  async () => {
    const [s, todayCost] = await Promise.all([
      settings.get(),
      usage.sumCost(bangkokDayRange(clock.now())),
    ]);
    return ok({
      lastWebhookAt: s.lastWebhookAt,
      lastLineError: s.lastLineError,
      lastAiError: s.lastAiError,
      todayCost,
      dailyBudget: s.aiDailyBudget,
      priceTableDate: config.priceTable.asOf,
      database: 'ok',
    });
  };
