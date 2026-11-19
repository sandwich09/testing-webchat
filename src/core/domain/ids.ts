declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ContactId = Brand<string, 'ContactId'>; // UUIDv7
export type MessageId = Brand<string, 'MessageId'>; // UUIDv7 (outbound admin ids are made in the browser)
export type DocumentId = Brand<string, 'DocumentId'>; // UUIDv7
export type UsageId = Brand<string, 'UsageId'>; // UUIDv7
export type NoteId = Brand<string, 'NoteId'>; // UUIDv7
export type LineUserId = Brand<string, 'LineUserId'>; // LINE userId
export type LineMessageId = Brand<string, 'LineMessageId'>; // LINE message.id
export type WebhookEventId = Brand<string, 'WebhookEventId'>;
export type StorageKey = Brand<string, 'StorageKey'>; // path in file storage
export type UploadId = Brand<string, 'UploadId'>; // random 128-bit token, base64url
export type Seq = Brand<bigint, 'Seq'>; // from the single database sequence
export type NanoUsd = Brand<bigint, 'NanoUsd'>; // 1 USD = 1_000_000_000n
export type LineAccessToken = Brand<string, 'LineAccessToken'>;
