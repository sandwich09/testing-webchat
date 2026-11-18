import type {
  CannedReplyId,
  ContactId,
  DocumentId,
  LineAccessToken,
  MessageId,
  Result,
  Seq,
  UploadId,
} from '@/core/domain';
import { bangkokMonthOf, err, ok, parseUsd } from '@/core/domain';
import type { ContactListCursor } from '@/core/ports';
import type {
  GetMessagesInput,
  ListContactsInput,
  SaveCannedReplyInput,
  SendAdminMessageInput,
  SetLineCredentialsInput,
  UpdateSettingsInput,
} from '@/core/use-cases';
import {
  DEFAULT_CONTACT_FILTER,
  type CreateCannedReplyBody,
  type GetMessagesQuery,
  type ListContactsQuery,
  type SendMessageBody,
  type SetLineCredentialsBody,
  type UpdateCannedReplyBody,
  type UpdateSettingsBody,
} from '@/contracts';
import { decodeContactCursor } from './http-request';

// Validated request values (from the contract schemas) to use case inputs. Ids are branded
// here: the schema has checked the string, and an unknown id is answered 404 by the use case.

export const asContactId = (id: string): ContactId => id as ContactId;
export const asMessageId = (id: string): MessageId => id as MessageId;
export const asDocumentId = (id: string): DocumentId => id as DocumentId;
export const asCannedReplyId = (id: string): CannedReplyId => id as CannedReplyId;
export const asUploadId = (id: string): UploadId => id as UploadId;
/** A decimal string the contract schema has already checked (seqStringSchema). */
const asSeq = (digits: string): Seq => BigInt(digits) as Seq;

/** GET /api/contacts query: page mode (filter, q, before) or polling mode (afterUpdatedSeq). */
export const toListContactsInput = (
  query: ListContactsQuery,
): Result<ListContactsInput, 'request.invalid'> => {
  if (query.afterUpdatedSeq !== undefined) {
    return ok({ mode: 'changes', afterUpdatedSeq: asSeq(query.afterUpdatedSeq) });
  }
  let before: ContactListCursor | null = null;
  if (query.before !== undefined) {
    const decoded = decodeContactCursor(query.before);
    if (!decoded.ok) return decoded;
    before = decoded.value;
  }
  return ok({
    mode: 'page',
    filter: query.filter ?? DEFAULT_CONTACT_FILTER,
    search: query.q ?? null,
    before,
  });
};

/**
 * GET /api/contacts/:id/messages. `limit` is accepted by the contract but GetMessages pages by
 * MESSAGE_PAGE_LIMIT itself, so it is not passed on.
 */
export const toGetMessagesInput = (
  contactId: string,
  query: GetMessagesQuery,
): GetMessagesInput => ({
  contactId: asContactId(contactId),
  mode:
    query.afterUpdatedSeq !== undefined
      ? { kind: 'changes', afterUpdatedSeq: asSeq(query.afterUpdatedSeq) }
      : query.beforeSeq !== undefined
        ? { kind: 'before', beforeSeq: asSeq(query.beforeSeq) }
        : { kind: 'latest' },
});

/** POST /api/contacts/:id/messages. */
export const toSendAdminMessageInput = (
  contactId: string,
  body: SendMessageBody,
): SendAdminMessageInput => ({
  contactId: asContactId(contactId),
  messageId: asMessageId(body.id),
  content:
    body.kind === 'text'
      ? { kind: 'text', text: body.text }
      : { kind: body.kind, uploadId: asUploadId(body.uploadId), contentType: body.contentType },
});

/** PATCH /api/settings. The budget string becomes NanoUsd; field names follow UpdateSettings. */
export const toUpdateSettingsInput = (
  body: UpdateSettingsBody,
): Result<UpdateSettingsInput, 'request.invalid'> => {
  const input: UpdateSettingsInput = {};
  if (body.aiEnabled !== undefined) input.aiEnabled = body.aiEnabled;
  if (body.aiModel !== undefined) input.aiModel = body.aiModel;
  if (body.aiDailyBudgetUsd !== undefined) {
    const budget = parseUsd(body.aiDailyBudgetUsd);
    if (budget === null) return err('request.invalid');
    input.aiDailyBudget = budget;
  }
  if (body.aiPoliteParticle !== undefined) input.aiPoliteParticle = body.aiPoliteParticle;
  if (body.aiInstructions !== undefined) input.aiInstructions = body.aiInstructions;
  if (body.guardEnabled !== undefined) input.guardEnabled = body.guardEnabled;
  if (body.guardTopics !== undefined) input.guardTopics = body.guardTopics;
  if (body.guardRefusalText !== undefined) input.guardRefusalText = body.guardRefusalText;
  return ok(input);
};

/** PUT /api/settings/line-credentials. */
export const toSetLineCredentialsInput = (
  body: SetLineCredentialsBody,
): SetLineCredentialsInput => ({
  channelSecret: body.channelSecret,
  channelAccessToken: body.channelAccessToken as LineAccessToken,
});

/** POST /api/canned-replies. */
export const toCreateCannedReplyInput = (body: CreateCannedReplyBody): SaveCannedReplyInput => ({
  id: null,
  title: body.title,
  text: body.text,
});

/** PATCH /api/canned-replies/:id. */
export const toUpdateCannedReplyInput = (
  id: string,
  body: UpdateCannedReplyBody,
): SaveCannedReplyInput => ({ id: asCannedReplyId(id), ...body });

/** `*key` segments of /api/local-storage/*key back into the storage key. */
export const toLocalStorageKey = (segments: readonly string[]): string => segments.join('/');

/** `month` of GET /api/usage and /api/usage/contacts/:id: the current Bangkok month by default. */
export const toUsageMonth = (month: string | undefined, now: Date): string =>
  month ?? bangkokMonthOf(now);
