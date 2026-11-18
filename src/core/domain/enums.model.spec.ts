import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_IDS,
  DELIVERY_STATUSES,
  DOCUMENT_STATUSES,
  EVENT_CODES,
  HANDOFF_REASONS,
  MEDIA_STATUSES,
  MODEL_HANDOFF_REASONS,
  OTHER_KINDS,
  RATE_LIMIT_ACTIONS,
  USAGE_KINDS,
  USAGE_OUTCOMES,
} from './enums.model';

describe('enum value sets (domain-and-ports.md, Enum)', () => {
  it('HandoffReason', () => {
    expect([...HANDOFF_REASONS]).toEqual([
      'customer_sent_image',
      'customer_sent_video',
      'customer_sent_non_text',
      'budget_reached',
      'ai_not_in_knowledge',
      'ai_needs_human_action',
      'ai_unsafe_or_offtopic',
      'ai_other',
      'ai_failed',
      'ai_timeout',
    ]);
  });

  it('ModelHandoffReason', () => {
    expect([...MODEL_HANDOFF_REASONS]).toEqual([
      'not_in_knowledge',
      'needs_human_action',
      'unsafe_or_offtopic',
      'other',
    ]);
  });

  it('every model handoff reason maps to an "ai_" handoff reason', () => {
    for (const reason of MODEL_HANDOFF_REASONS) {
      expect(HANDOFF_REASONS).toContain(`ai_${reason}`);
    }
  });

  it('MediaStatus', () => {
    expect([...MEDIA_STATUSES]).toEqual(['pending', 'ready', 'failed', 'too_large']);
  });

  it('OtherKind', () => {
    expect([...OTHER_KINDS]).toEqual(['audio', 'file', 'location', 'unknown']);
  });

  it('EventCode', () => {
    expect([...EVENT_CODES]).toEqual([
      'handoff.customer_sent_image',
      'handoff.customer_sent_video',
      'handoff.customer_sent_non_text',
      'handoff.budget_reached',
      'handoff.ai_not_in_knowledge',
      'handoff.ai_needs_human_action',
      'handoff.ai_unsafe_or_offtopic',
      'handoff.ai_other',
      'handoff.ai_failed',
      'handoff.ai_timeout',
      'ai.turned_off_by_admin',
      'guard.blocked',
      'contact.followed',
      'contact.unfollowed',
    ]);
  });

  it('other enums', () => {
    expect([...DELIVERY_STATUSES]).toEqual(['pending', 'sent', 'failed']);
    expect([...DOCUMENT_STATUSES]).toEqual(['processing', 'ready', 'failed']);
    expect([...AI_MODEL_IDS]).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
    expect([...RATE_LIMIT_ACTIONS]).toEqual([
      'unlock',
      'send_message',
      'upload_ticket',
      'pdf_ingest',
      'typing',
      'guard_test',
    ]);
  });

  it('UsageKind and UsageOutcome', () => {
    expect([...USAGE_KINDS]).toEqual(['reply', 'ingest', 'guard']);
    expect([...USAGE_OUTCOMES]).toEqual([
      'ok',
      'handoff',
      'refused',
      'failed',
      'cancelled',
      'blocked',
    ]);
  });
});
