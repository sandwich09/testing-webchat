import type { CannedReplyId } from './ids';

export interface CannedReply {
  id: CannedReplyId;
  /** 1 to CANNED_TITLE_MAX_CHARS characters. */
  title: string;
  /** 1 to CANNED_TEXT_MAX_CHARS characters. */
  text: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
