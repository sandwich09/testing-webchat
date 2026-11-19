import { describe, expect, it } from 'vitest';
import { ERROR_CODES, EVENT_CODES, HANDOFF_REASONS } from '@/contracts';
import {
  ERROR_MESSAGE_CODES,
  errorMessage,
  eventCodeText,
  handoffReasonText,
} from './error-messages';

// The codes of docs/architecture/error-catalog.md (ERROR_CODES plus client.network), in order.
const CATALOG_CODES = [
  'request.invalid',
  'request.too_large',
  'request.origin_forbidden',
  'internal.unexpected',
  'db.unavailable',
  'storage.unavailable',
  'secret.decrypt_failed',
  'access.unauthorized',
  'access.code_invalid',
  'access.rate_limited',
  'webhook.signature_invalid',
  'webhook.payload_invalid',
  'line.not_configured',
  'line.credentials_unreadable',
  'line.credentials_invalid',
  'line.channel_secret_invalid',
  'line.channel_mismatch',
  'line.unauthorized',
  'line.quota_exceeded',
  'line.rate_limited',
  'line.push_failed',
  'line.reply_failed',
  'line.unavailable',
  'line.reply_token_invalid',
  'line.profile_unavailable',
  'line.content_unavailable',
  'line.content_not_ready',
  'line.loading_failed',
  'line.send_interrupted',
  'line.rich_menu_failed',
  'line.rich_menu_conflict',
  'contact.not_found',
  'contact.unfollowed',
  'message.not_found',
  'message.not_retryable',
  'message.retry_expired',
  'message.id_conflict',
  'message.rate_limited',
  'note.not_found',
  'note.rate_limited',
  'upload.rate_limited',
  'upload.type_not_allowed',
  'upload.too_large',
  'upload.not_found',
  'upload.content_mismatch',
  'upload.incomplete',
  'upload.signature_invalid',
  'upload.expired',
  'media.too_large',
  'media.not_found',
  'ai.disabled_globally',
  'ai.budget_exhausted',
  'ai.refused',
  'ai.truncated',
  'ai.invalid_output',
  'ai.unavailable',
  'ai.rate_limited',
  'ai.auth_failed',
  'ai.bad_request',
  'ai.no_response',
  'ai.link_not_allowed',
  'settings.guard_topics_required',
  'settings.guard_rate_limited',
  'knowledge.rate_limited',
  'knowledge.file_too_large',
  'knowledge.not_pdf',
  'knowledge.duplicate',
  'knowledge.not_found',
  'knowledge.not_retryable',
  'knowledge.too_many_pages',
  'knowledge.capacity_exceeded',
  'knowledge.extract_failed',
  'knowledge.extract_empty',
  'knowledge.extract_refused',
  'knowledge.extract_interrupted',
  'client.network',
];

// Codes whose text column of the catalog says there is nothing to show.
const NO_TEXT_CODES = [
  'db.unavailable',
  'secret.decrypt_failed',
  'access.unauthorized',
  'webhook.signature_invalid',
  'webhook.payload_invalid',
  'line.reply_token_invalid',
  'line.profile_unavailable',
  'line.content_unavailable',
  'line.content_not_ready',
  'line.loading_failed',
  'media.not_found',
];

// The values of error-catalog.md, section "เหตุผลของสถานะรอแอดมิน".
const CATALOG_HANDOFF_REASONS = [
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
  'customer_asked_admin',
  'ai_unavailable',
];

describe('errorMessage', () => {
  it('has an entry for every code of the catalog, no more and no less', () => {
    expect([...ERROR_MESSAGE_CODES].sort()).toEqual([...CATALOG_CODES].sort());
  });

  it('covers every value of the domain ERROR_CODES and client.network', () => {
    expect([...ERROR_MESSAGE_CODES].sort()).toEqual([...ERROR_CODES, 'client.network'].sort());
  });

  it('gives text for every code except those the catalog does not show', () => {
    for (const code of ERROR_MESSAGE_CODES) {
      const text = errorMessage(code, {
        size: 12,
        maxMb: 4,
        imageMaxMb: 10,
        videoMaxMb: 50,
        pageCount: 31,
        maxPages: 30,
        over: 100,
        max: 100,
        hours: 24,
      });
      if (NO_TEXT_CODES.includes(code)) {
        expect(text, code).toBeNull();
      } else {
        expect(text, code).toEqual(expect.any(String));
        expect(text, code).not.toBe('');
        expect(text, code).not.toMatch(/\{[A-Za-z]+\}/);
      }
    }
  });

  it('has no polite particle at the end of a text', () => {
    for (const code of ERROR_MESSAGE_CODES) {
      expect(errorMessage(code) ?? '', code).not.toMatch(/(ค่ะ|ครับ)$/);
    }
  });

  it('uses the common.error.network text for client.network', () => {
    expect(errorMessage('client.network')).toBe('เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
  });

  it('picks the wording by variant and falls back to the default', () => {
    expect(errorMessage('internal.unexpected')).toBe('เกิดข้อผิดพลาดในระบบ ลองอีกครั้ง');
    expect(errorMessage('internal.unexpected', { variant: 'form' })).toBe(
      'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ ลองอีกครั้ง',
    );
    expect(errorMessage('internal.unexpected', { variant: 'knowledge' })).toBe(
      'แปลงไฟล์ไม่สำเร็จเพราะระบบขัดข้อง กด "ลองใหม่"',
    );
    expect(errorMessage('internal.unexpected', { variant: 'outbound' })).toBe(
      'เกิดข้อผิดพลาดในระบบ ลองอีกครั้ง',
    );
    expect(errorMessage('line.unavailable', { variant: 'settings' })).toBe(
      'ติดต่อ LINE ไม่ได้ ลองอีกครั้งในอีกสักครู่',
    );
    expect(errorMessage('line.unavailable')).toBe('ส่งไม่สำเร็จ ติดต่อ LINE ไม่ได้ กด "ส่งอีกครั้ง"');
    expect(errorMessage('media.too_large', { variant: 'inbound' })).toBe('ไฟล์ใหญ่เกินกว่าที่ระบบเก็บได้');
    expect(
      errorMessage('media.too_large', { variant: 'outbound', imageMaxMb: 10, videoMaxMb: 50 }),
    ).toBe('ไฟล์ใหญ่เกินไป รูปต้องไม่เกิน 10 MB และวิดีโอไม่เกิน 50 MB');
  });

  it('has the topic guard texts and the budget text of the catalog', () => {
    expect(errorMessage('settings.guard_topics_required')).toBe(
      'ใส่หัวข้ออย่างน้อยหนึ่งหัวข้อแล้วบันทึกก่อน จึงจะเปิดหรือทดลองขอบเขตหัวข้อได้',
    );
    expect(errorMessage('settings.guard_rate_limited')).toBe('ทดลองถี่เกินไป รอสักครู่แล้วลองใหม่');
    expect(errorMessage('ai.budget_exhausted')).toBe(
      'งบ AI ของวันนี้เต็ม ใช้ได้อีกครั้งหลังเที่ยงคืน หรือเพิ่มงบต่อวันที่ ตั้งค่า › AI ตอบแทน',
    );
  });

  it('fills placeholders and leaves a missing one as written', () => {
    expect(errorMessage('knowledge.file_too_large', { size: '5.2', maxMb: 4 })).toBe(
      'ไฟล์นี้ 5.2 MB เกินขีดจำกัด 4 MB',
    );
    expect(errorMessage('upload.too_large', { imageMaxMb: 10, videoMaxMb: 50, size: 61 })).toBe(
      'ไฟล์ใหญ่เกินไป รูปต้องไม่เกิน 10 MB และวิดีโอไม่เกิน 50 MB ไฟล์นี้ 61 MB',
    );
    expect(errorMessage('upload.too_large')).toContain('{imageMaxMb}');
  });
});

describe('handoffReasonText', () => {
  it('covers the same reasons as the catalog and the domain HandoffReason', () => {
    expect([...HANDOFF_REASONS].sort()).toEqual([...CATALOG_HANDOFF_REASONS].sort());
  });

  it('gives text for every known reason', () => {
    for (const reason of HANDOFF_REASONS) {
      expect(handoffReasonText(reason), reason).toEqual(expect.any(String));
      expect(handoffReasonText(reason), reason).not.toBe('แชทนี้รอแอดมิน');
    }
    expect(handoffReasonText('budget_reached')).toBe('งบ AI ของวันนี้เต็ม');
  });

  it('gives the fallback text for an unknown reason', () => {
    expect(handoffReasonText('something_new')).toBe('แชทนี้รอแอดมิน');
    expect(handoffReasonText('toString')).toBe('แชทนี้รอแอดมิน');
  });
});

describe('eventCodeText', () => {
  it('uses the text of the reason for handoff.{reason}', () => {
    for (const reason of HANDOFF_REASONS) {
      expect(eventCodeText(`handoff.${reason}`), reason).toBe(handoffReasonText(reason));
    }
  });

  it('gives text for every value of the domain EVENT_CODES', () => {
    for (const code of EVENT_CODES) expect(eventCodeText(code), code).toEqual(expect.any(String));
  });

  it('gives text for the other known codes', () => {
    expect(eventCodeText('ai.turned_off_by_admin')).toBe(
      'คุณตอบเอง AI ตอบแทนของลูกค้าคนนี้จึงปิด เปิดอีกครั้งได้ที่สวิตช์ด้านบน',
    );
    expect(eventCodeText('guard.blocked')).toBe('นอกขอบเขตหัวข้อ AI จึงไม่ตอบ');
    expect(eventCodeText('contact.followed')).toBe('ลูกค้าเพิ่มเพื่อน');
    expect(eventCodeText('contact.unfollowed')).toBe('ลูกค้าเลิกติดตามแล้ว');
  });

  it('gives null for an unknown code so the line is not shown', () => {
    expect(eventCodeText('something.new')).toBeNull();
    expect(eventCodeText('handoff.something_new')).toBeNull();
    expect(eventCodeText('handoff.')).toBeNull();
    expect(eventCodeText('toString')).toBeNull();
  });
});
