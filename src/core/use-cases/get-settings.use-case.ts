import type { NanoUsd, Settings } from '@/core/domain';
import { bangkokDayRange, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type GetSettingsInput = Record<string, never>;

export type GetSettingsOutput = {
  settings: Settings;
  webhookUrl: string;
  todayCost: NanoUsd;
  /** AiUsage rows with kind guard and outcome blocked, today in Bangkok time. */
  guardBlockedToday: number;
  pollIntervalMs: number;
};

export type GetSettingsDeps = Pick<AllPorts, 'settings' | 'usage' | 'clock'>;

export const makeGetSettings: (
  deps: GetSettingsDeps,
  config: UseCaseConfig,
) => UseCase<GetSettingsInput, GetSettingsOutput> =
  ({ settings, usage, clock }, config) =>
  async () => {
    const range = bangkokDayRange(clock.now());
    const [current, todayCost, safety] = await Promise.all([
      settings.get(),
      usage.sumCost(range),
      usage.countSafetyOutcomes(range),
    ]);
    return ok({
      settings: current,
      webhookUrl: `${config.appBaseUrl.replace(/\/+$/, '')}/api/line/webhook`,
      todayCost,
      guardBlockedToday: safety.guardBlocked,
      pollIntervalMs: config.pollIntervalMs,
    });
  };
