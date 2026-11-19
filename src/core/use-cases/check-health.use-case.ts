import { err, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type CheckHealthInput = Record<string, never>;

export type CheckHealthOutput = { database: 'ok' };

export type CheckHealthDeps = Pick<AllPorts, 'settings'>;

/**
 * Catches a repository exception because it exists to report a down database (ReceiveLineEvents
 * asks the same `ping` to tell an outage from failed events).
 */
export const makeCheckHealth: (
  deps: CheckHealthDeps,
  config: UseCaseConfig,
) => UseCase<CheckHealthInput, CheckHealthOutput, 'db.unavailable'> =
  ({ settings }) =>
  async () => {
    try {
      await settings.ping();
    } catch {
      return err('db.unavailable');
    }
    return ok({ database: 'ok' });
  };
