import type { AiModelId, NanoUsd, PoliteParticle, Settings } from '@/core/domain';
import { err, normalizeGuardTopics, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type UpdateSettingsInput = Partial<{
  aiEnabled: boolean;
  aiModel: AiModelId;
  aiDailyBudget: NanoUsd;
  aiPoliteParticle: PoliteParticle;
  aiInstructions: string;
  guardEnabled: boolean;
  guardTopics: string[];
  guardRefusalText: string;
}>;

export type UpdateSettingsOutput = Settings;

export type UpdateSettingsDeps = Pick<AllPorts, 'settings' | 'logger'>;

/**
 * Saves the fields of a patch. Turning the topic guard on without a topic is refused before
 * anything is written. The route has checked the shape and lengths.
 */
export const makeUpdateSettings: (
  deps: UpdateSettingsDeps,
  config: UseCaseConfig,
) => UseCase<UpdateSettingsInput, UpdateSettingsOutput, 'settings.guard_topics_required'> =
  ({ settings, logger }) =>
  async (input, ctx) => {
    const patch: UpdateSettingsInput = { ...input };

    if (patch.guardTopics !== undefined) {
      const normalized = normalizeGuardTopics(patch.guardTopics);
      if (normalized.issue !== null) {
        // The route validated the list, so an issue here is a bug, not an expected failure.
        throw new Error(
          `UpdateSettings: guardTopics reached the use case with ${normalized.issue}`,
        );
      }
      patch.guardTopics = normalized.topics;
    }

    if (patch.guardEnabled !== undefined || patch.guardTopics !== undefined) {
      const current = await settings.get();
      const enabled = patch.guardEnabled ?? current.guardEnabled;
      const topics = patch.guardTopics ?? current.guardTopics;
      if (enabled && topics.length === 0) return err('settings.guard_topics_required');
    }

    if (patch.guardRefusalText !== undefined)
      patch.guardRefusalText = patch.guardRefusalText.trim();

    const updated = await settings.update(patch);
    logger.log('info', 'settings.values.updated', {
      requestId: ctx.requestId,
      count: Object.keys(patch).length,
    });
    return ok(updated);
  };
