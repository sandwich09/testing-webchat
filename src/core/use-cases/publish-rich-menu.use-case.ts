import type { ErrorCode, LineAccessToken } from '@/core/domain';
import { err, ok, richMenuSpec } from '@/core/domain';
import type { RichMenuError } from '@/core/ports';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

/**
 * What the route answers. LINE's 401 and 429 have no HTTP status of their own (error-catalog), so
 * they are answered as `line.credentials_invalid` and `line.unavailable`; the stored error keeps
 * LINE's code.
 */
export type RichMenuUseCaseError =
  | 'line.credentials_invalid'
  | 'line.unavailable'
  | 'line.rich_menu_failed'
  | 'line.rich_menu_conflict'
  | 'line.not_configured'
  | 'line.credentials_unreadable';

const answerOf = (code: RichMenuError): RichMenuUseCaseError =>
  code === 'line.unauthorized'
    ? 'line.credentials_invalid'
    : code === 'line.rate_limited'
      ? 'line.unavailable'
      : code;

export type PublishRichMenuDeps = Pick<
  AllPorts,
  'settings' | 'cipher' | 'gateway' | 'clock' | 'logger'
>;

/**
 * "Publish rich menu" (specs/line-messaging.md "Rich menu"): create the menu, upload its picture,
 * make it the default, then record it with a compare-and-set on the menu stored before, and
 * delete that one. A step that fails deletes the new menu, so no half-made menu is left at LINE,
 * and keeps the earlier menu as it was. Setting the default with no answer (`line.unavailable`)
 * may have worked, so the new menu is kept and recorded instead of deleted: the next publish or
 * removal cleans it up. When a concurrent publish recorded its menu first, this one makes that
 * menu the default again, deletes its own and answers `line.rich_menu_conflict`.
 */
export const makePublishRichMenu: (
  deps: PublishRichMenuDeps,
  config: UseCaseConfig,
) => UseCase<Record<string, never>, { richMenuId: string }, RichMenuUseCaseError> = (deps) => {
  const { settings, gateway, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

  const cleanUp = async (token: LineAccessToken, richMenuId: string): Promise<void> => {
    const deleted = await gateway.deleteRichMenu(token, richMenuId);
    if (!deleted.ok) {
      logger.log('warn', 'line.rich_menu.cleanup_failed', { errorCode: deleted.error.code });
    }
  };

  const failed = async (
    code: ErrorCode,
    step: 'create' | 'upload' | 'set_default' | 'set_default_unknown' | 'conflict',
  ) => {
    await settings.recordRichMenuError({ code, at: clock.now() });
    logger.log('warn', 'line.rich_menu.publish_failed', { errorCode: code, outcome: step });
  };

  return async () => {
    const access = await loadLineAccess();
    if (!access.ok) return err(access.error.code);
    const token = access.value.channelAccessToken;
    const previous = (await settings.get()).richMenu;

    const created = await gateway.createRichMenu(token, richMenuSpec());
    if (!created.ok) {
      await failed(created.error.code, 'create');
      return err(answerOf(created.error.code));
    }
    const id = created.value.richMenuId;

    const uploaded = await gateway.uploadRichMenuImage(token, id);
    if (!uploaded.ok) {
      await cleanUp(token, id);
      await failed(uploaded.error.code, 'upload');
      return err(answerOf(uploaded.error.code));
    }

    const previousId = previous?.id ?? null;
    const made = await gateway.setDefaultRichMenu(token, id);
    if (!made.ok && made.error.code === 'line.unavailable') {
      // No answer: the new menu may already be the default, so it is not deleted. It is recorded
      // (when no other publish recorded first) so the next publish or removal deletes it.
      await settings.replaceRichMenu(previousId, { id, publishedAt: clock.now() });
      await failed(made.error.code, 'set_default_unknown');
      return err(answerOf(made.error.code));
    }
    if (!made.ok) {
      await cleanUp(token, id);
      await failed(made.error.code, 'set_default');
      return err(answerOf(made.error.code));
    }

    if (!(await settings.replaceRichMenu(previousId, { id, publishedAt: clock.now() }))) {
      // Another publish recorded its menu while this one ran, and LINE's default may now be this
      // one: the recorded menu is made the default again before this one is deleted.
      const winner = (await settings.get()).richMenu;
      const restored = winner === null ? null : await gateway.setDefaultRichMenu(token, winner.id);
      if (restored?.ok !== false) await cleanUp(token, id);
      await failed('line.rich_menu_conflict', 'conflict');
      return err('line.rich_menu_conflict');
    }
    logger.log('info', 'line.rich_menu.published');
    // The earlier menu is no longer the default; a failure here leaves an unused menu at LINE.
    if (previous !== null && previous.id !== id) await cleanUp(token, previous.id);
    return ok({ richMenuId: id });
  };
};

export type RemoveRichMenuDeps = PublishRichMenuDeps;

/**
 * "นำ rich menu ออก": clear the default menu of every user, then delete the menu this app
 * published. A failure keeps the stored menu so the admin can try again.
 */
export const makeRemoveRichMenu: (
  deps: RemoveRichMenuDeps,
  config: UseCaseConfig,
) => UseCase<Record<string, never>, undefined, RichMenuUseCaseError> = (deps) => {
  const { settings, gateway, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

  const failed = async (code: ErrorCode) => {
    await settings.recordRichMenuError({ code, at: clock.now() });
    logger.log('warn', 'line.rich_menu.remove_failed', { errorCode: code });
  };

  return async () => {
    const access = await loadLineAccess();
    if (!access.ok) return err(access.error.code);
    const token = access.value.channelAccessToken;
    const current = (await settings.get()).richMenu;

    const cleared = await gateway.clearDefaultRichMenu(token);
    if (!cleared.ok) {
      await failed(cleared.error.code);
      return err(answerOf(cleared.error.code));
    }
    if (current !== null) {
      const deleted = await gateway.deleteRichMenu(token, current.id);
      if (!deleted.ok) {
        await failed(deleted.error.code);
        return err(answerOf(deleted.error.code));
      }
    }
    await settings.recordRichMenu(null);
    logger.log('info', 'line.rich_menu.removed');
    return ok(undefined);
  };
};
