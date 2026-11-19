import type { ContactId, Message, MessageId, Result, UploadId } from '@/core/domain';
import {
  PREVIEW_MAX_BYTES,
  err,
  ok,
  outboundMediaRule,
  outboundStorageKeys,
  previewOf,
  sniffContentType,
} from '@/core/domain';
import { makeDeliverOutbound } from './shared/deliver-outbound';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type SendAdminMessageInput = {
  contactId: ContactId;
  messageId: MessageId;
  content:
    | { kind: 'text'; text: string }
    | { kind: 'image' | 'video'; uploadId: UploadId; contentType: string };
};

export type SendAdminMessageOutput = Message;

// `ids`: step 8 inserts an event line, which needs a new message id (code-style rule 3).
export type SendAdminMessageDeps = Pick<
  AllPorts,
  | 'messages'
  | 'contacts'
  | 'settings'
  | 'cipher'
  | 'gateway'
  | 'storage'
  | 'rateLimits'
  | 'hasher'
  | 'ids'
  | 'clock'
  | 'logger'
>;

type MediaContent = Extract<SendAdminMessageInput['content'], { kind: 'image' | 'video' }>;

type MediaError =
  | 'upload.type_not_allowed'
  | 'upload.not_found'
  | 'upload.too_large'
  | 'upload.content_mismatch'
  | 'storage.unavailable';

/**
 * A stored row answers a repeated request only when it is the same admin message: same contact,
 * outbound by the admin, and the same kind of content (and the same text for text). Anything else
 * means the browser-made id collides with another message.
 */
const isSameRequest = (m: Message, input: SendAdminMessageInput): boolean => {
  if (m.contactId !== input.contactId || m.direction !== 'outbound' || m.author !== 'admin') {
    return false;
  }
  const { content } = input;
  return content.kind === 'text'
    ? m.type === 'text' && m.text === content.text
    : m.type === content.kind;
};

const replay = (
  m: Message,
  input: SendAdminMessageInput,
): Result<Message, 'message.id_conflict'> =>
  isSameRequest(m, input) ? ok(m) : err('message.id_conflict');

export const makeSendAdminMessage: (
  deps: SendAdminMessageDeps,
  config: UseCaseConfig,
) => UseCase<
  SendAdminMessageInput,
  SendAdminMessageOutput,
  | 'message.id_conflict'
  | 'message.rate_limited'
  | 'contact.not_found'
  | 'contact.unfollowed'
  | 'line.not_configured'
  | 'line.credentials_unreadable'
  | 'upload.type_not_allowed'
  | 'upload.not_found'
  | 'upload.too_large'
  | 'upload.content_mismatch'
  | 'storage.unavailable'
> = (deps, config) => {
  const { messages, contacts, storage, ids, clock } = deps;
  const hitRateLimit = makeHitRateLimit(deps, config);
  const loadLineAccess = makeLoadLineAccess(deps);
  const deliverOutbound = makeDeliverOutbound(deps);

  /** Checks both uploaded files by their real content and returns their public URLs. */
  const checkUpload = async (
    content: MediaContent,
  ): Promise<Result<{ mediaUrl: string; previewUrl: string }, MediaError>> => {
    const rule = outboundMediaRule(content.kind);
    if (!rule.contentTypes.includes(content.contentType)) return err('upload.type_not_allowed');
    const keys = outboundStorageKeys(content.uploadId, content.contentType);

    const orig = await storage.inspect(keys.original);
    if (!orig.ok) return err(orig.error.code);
    if (orig.value.sizeBytes > rule.maxBytes) return err('upload.too_large');
    if (sniffContentType(orig.value.leadingBytes) !== content.contentType) {
      return err('upload.content_mismatch');
    }

    const prev = await storage.inspect(keys.preview);
    if (!prev.ok) return err(prev.error.code);
    if (sniffContentType(prev.value.leadingBytes) !== 'image/jpeg') {
      return err('upload.content_mismatch');
    }
    if (prev.value.sizeBytes > PREVIEW_MAX_BYTES) return err('upload.too_large');

    return ok({ mediaUrl: orig.value.publicUrl, previewUrl: prev.value.publicUrl });
  };

  return async (input, ctx) => {
    const { contactId, messageId, content } = input;

    // A repeated click or network retry is answered from the stored row and not rate counted.
    const existing = await messages.findById(messageId);
    if (existing !== null) return replay(existing, input);

    const now = clock.now();
    const limit = await hitRateLimit('send_message', ctx.clientIp ?? 'unknown', now);
    if (limit.limited) return err('message.rate_limited', undefined, limit.retryAfterSeconds);

    const contact = await contacts.findById(contactId);
    if (contact === null) return err('contact.not_found');
    if (contact.followStatus === 'unfollowed') return err('contact.unfollowed');

    const access = await loadLineAccess();
    if (!access.ok) return err(access.error.code);

    let media: { mediaUrl: string; previewUrl: string } | null = null;
    if (content.kind !== 'text') {
      const checked = await checkUpload(content);
      if (!checked.ok) return err(checked.error.code);
      media = checked.value;
    }

    const { inserted, message } = await messages.insertOutboundIfAbsent({
      id: messageId,
      contactId,
      direction: 'outbound',
      author: 'admin',
      type: content.kind,
      text: content.kind === 'text' ? content.text : null,
      mediaUrl: media?.mediaUrl ?? null,
      previewUrl: media?.previewUrl ?? null,
      mediaStatus: media === null ? null : 'ready',
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: null,
      lineMessageId: null,
      deliveryStatus: 'pending',
      deliveryError: null,
      retryKey: messageId,
      createdAt: now,
      sentAt: null,
    });
    // A concurrent request with the same id inserted first: it owns the side effects and the send.
    if (!inserted) return replay(message, input);

    await contacts.recordOutbound(contactId, { preview: previewOf(message), by: 'admin' });

    // docs/specs/ai-reply.md#เมื่อแอดมินตอบเอง: an admin reply turns the contact's AI off for good.
    if (contact.aiEnabled) {
      await contacts.setAiEnabled(contactId, false);
      await messages.insertEvent({
        id: ids.messageId(),
        contactId,
        direction: 'internal',
        author: 'system',
        type: 'event',
        text: null,
        mediaUrl: null,
        previewUrl: null,
        mediaStatus: null,
        stickerPackageId: null,
        stickerId: null,
        otherKind: null,
        eventCode: 'ai.turned_off_by_admin',
        lineMessageId: null,
        deliveryStatus: null,
        deliveryError: null,
        retryKey: null,
        createdAt: now,
        sentAt: null,
      });
    }
    if (contact.needsAdmin) await contacts.clearNeedsAdmin(contactId);

    return ok(await deliverOutbound(message, contact, access.value, 'auto'));
  };
};
