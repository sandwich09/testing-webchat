// The one table that turns an error code, a handoff reason or an event code into Thai text.
// Source of truth: docs/architecture/error-catalog.md. Texts are copied from it unchanged.
//
// src/common may not import src/core/domain (eslint boundaries), so the code types come from
// src/contracts, which re-exports them. The tables are typed `Record<...>` so that a missing
// key fails typecheck.
import type { ErrorCode, EventCode, HandoffReason } from '@/contracts';
import { copy as commonCopy } from './common.constants';

/** Codes the browser creates itself when the server gave no answer. Not part of `ERROR_CODES`. */
export type ClientErrorCode = 'client.network';

export type ErrorMessageCode = ErrorCode | ClientErrorCode;

/** Where the message is shown, for the codes whose text depends on it. */
export type ErrorMessageVariant = 'form' | 'knowledge' | 'settings' | 'inbound' | 'outbound';

/** Values for the `{...}` placeholders of a message. Numbers are formatted by the caller. */
export interface ErrorMessageContext {
  variant?: ErrorMessageVariant;
  /** Size in MB of the file that was rejected. */
  size?: string | number;
  maxMb?: string | number;
  imageMaxMb?: string | number;
  videoMaxMb?: string | number;
  pageCount?: string | number;
  maxPages?: string | number;
  /** Tokens by which the knowledge base would exceed its capacity. */
  over?: string | number;
  max?: string | number;
  /** Hours of LINE's retry key window (LINE_RETRY_KEY_WINDOW_MS). */
  hours?: string | number;
}

/** `null` means the catalog shows no text for the code. */
type MessageEntry =
  string | null | { readonly default: string; readonly [variant: string]: string };

const ERROR_MESSAGES: Record<ErrorMessageCode, MessageEntry> = {
  // Request and system
  'request.invalid': 'ข้อมูลที่ส่งไม่ถูกต้อง ตรวจช่องที่กรอกแล้วลองอีกครั้ง',
  'request.too_large': 'ข้อมูลใหญ่เกินที่ระบบรับได้ ลดขนาดแล้วลองอีกครั้ง',
  'request.origin_forbidden': 'คำขอนี้ไม่ได้มาจากหน้าเว็บของระบบ โหลดหน้าใหม่แล้วลองอีกครั้ง',
  'internal.unexpected': {
    default: 'เกิดข้อผิดพลาดในระบบ ลองอีกครั้ง',
    form: 'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ ลองอีกครั้ง',
    knowledge: 'แปลงไฟล์ไม่สำเร็จเพราะระบบขัดข้อง กด "ลองใหม่"',
  },
  'db.unavailable': null,
  'storage.unavailable': 'ที่เก็บไฟล์ใช้งานไม่ได้ชั่วคราว ลองอีกครั้งในอีกสักครู่',
  'secret.decrypt_failed': null,

  // Access
  'access.unauthorized': null,
  'access.code_invalid': 'รหัสไม่ถูกต้อง ลองอีกครั้ง',
  'access.rate_limited': 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',

  // Webhook and LINE
  'webhook.signature_invalid': null,
  'webhook.payload_invalid': null,
  'line.not_configured': 'ยังไม่ได้ตั้งค่า LINE Official Account ตั้งค่าได้ที่ ตั้งค่า › LINE',
  'line.credentials_unreadable':
    'อ่าน credential ของ LINE ที่บันทึกไว้ไม่ได้ กรอก Channel secret และ Channel access token ใหม่ที่ ตั้งค่า › LINE',
  'line.credentials_invalid': 'Channel access token ไม่ถูกต้อง ตรวจค่าที่คัดลอกมาอีกครั้ง',
  'line.channel_secret_invalid':
    'Channel ID กับ Channel secret ไม่ตรงกัน ตรวจว่าคัดลอกทั้งสองค่ามาจาก channel เดียวกัน',
  'line.channel_mismatch':
    'Channel access token เป็นของ channel อื่น ไม่ใช่ channel ของ Channel ID นี้ คัดลอกทั้งสามค่าจาก channel เดียวกันใน LINE Developers Console',
  'line.unauthorized': 'ส่งไม่สำเร็จ Channel access token ใช้ไม่ได้ ตรวจที่ ตั้งค่า › LINE',
  'line.quota_exceeded': 'ส่งไม่สำเร็จ โควตาข้อความของ LINE เต็ม',
  'line.rate_limited': 'ส่งไม่สำเร็จ LINE รับคำขอถี่เกินไป รอสักครู่แล้วกด "ส่งอีกครั้ง"',
  'line.push_failed': 'ส่งไม่สำเร็จ LINE ไม่รับข้อความนี้ กด "ส่งอีกครั้ง" ถ้ายังไม่ได้ ให้ตรวจไฟล์ที่แนบ',
  'line.reply_failed': 'ส่งไม่สำเร็จ LINE ไม่รับข้อความนี้ กด "ส่งอีกครั้ง"',
  'line.unavailable': {
    default: 'ส่งไม่สำเร็จ ติดต่อ LINE ไม่ได้ กด "ส่งอีกครั้ง"',
    settings: 'ติดต่อ LINE ไม่ได้ ลองอีกครั้งในอีกสักครู่',
  },
  'line.reply_token_invalid': null,
  'line.profile_unavailable': null,
  // The catalog shows no code here; the bubble shows the media text of ui-copy instead.
  'line.content_unavailable': null,
  'line.content_not_ready': null,
  'line.loading_failed': null,
  'line.rich_menu_failed':
    'LINE ไม่รับคำขอ rich menu ตรวจว่า channel นี้ใช้ Messaging API ได้ แล้วลองอีกครั้ง',
  'line.rich_menu_conflict':
    'มีการ publish rich menu อีกครั้งพร้อมกัน rich menu ที่แสดงอยู่คือรายการที่ publish สำเร็จ',
  'line.send_interrupted': 'ส่งไม่สำเร็จ ระบบหยุดทำงานก่อนรู้ผลการส่ง กด "ส่งอีกครั้ง"',

  // Contacts and messages
  'contact.not_found': 'ไม่พบแชทนี้ เลือกแชทจากรายชื่อ',
  'contact.unfollowed': 'ผู้ใช้เลิกติดตามแล้ว ส่งข้อความไม่ได้',
  'message.not_found': 'ไม่พบข้อความนี้ โหลดหน้าใหม่แล้วลองอีกครั้ง',
  'message.not_retryable': 'ข้อความนี้ส่งแล้วหรือกำลังส่งอยู่',
  'message.retry_expired':
    'ส่งไม่สำเร็จ ส่งอีกครั้งไม่ได้แล้วเพราะเกิน {hours} ชั่วโมงหลังส่งครั้งแรก พิมพ์ข้อความแล้วส่งใหม่',
  'message.id_conflict': 'ส่งไม่สำเร็จ คัดลอกข้อความแล้วส่งใหม่',
  'message.rate_limited': 'ส่งถี่เกินไป รอสักครู่แล้วส่งอีกครั้ง ข้อความที่พิมพ์ยังอยู่',
  'note.not_found': 'ไม่พบโน้ตนี้ อาจถูกลบไปแล้ว',
  'note.rate_limited': 'เพิ่มโน้ตถี่เกินไป รอสักครู่แล้วเพิ่มอีกครั้ง ข้อความที่พิมพ์ยังอยู่',

  // Uploads and media
  'upload.rate_limited': 'อัปโหลดถี่เกินไป รอสักครู่แล้วแนบใหม่',
  'upload.type_not_allowed': 'ส่งไฟล์ชนิดนี้ไม่ได้ รองรับรูป JPEG, PNG, WebP, HEIC และวิดีโอ MP4',
  'upload.too_large':
    'ไฟล์ใหญ่เกินไป รูปต้องไม่เกิน {imageMaxMb} MB และวิดีโอไม่เกิน {videoMaxMb} MB ไฟล์นี้ {size} MB',
  'upload.not_found': 'ไฟล์ที่แนบอัปโหลดไม่ครบ แนบไฟล์ใหม่อีกครั้ง',
  'upload.content_mismatch': 'เนื้อไฟล์ไม่ตรงกับชนิดของไฟล์ แนบไฟล์อื่น',
  'upload.incomplete': 'ไฟล์อัปโหลดไปไม่ครบ ลองแนบไฟล์อีกครั้ง',
  'upload.signature_invalid': 'อัปโหลดไม่สำเร็จ แนบไฟล์ใหม่อีกครั้ง',
  'upload.expired': 'สิทธิ์อัปโหลดหมดเวลา แนบไฟล์ใหม่อีกครั้ง',
  'media.too_large': {
    default: 'ไฟล์ใหญ่เกินกว่าที่ระบบเก็บได้',
    inbound: 'ไฟล์ใหญ่เกินกว่าที่ระบบเก็บได้',
    outbound: 'ไฟล์ใหญ่เกินไป รูปต้องไม่เกิน {imageMaxMb} MB และวิดีโอไม่เกิน {videoMaxMb} MB',
  },
  'media.not_found': null,

  // AI
  'ai.disabled_globally': 'AI ถูกปิดทั้งระบบ เปิดได้ที่ ตั้งค่า › AI',
  'ai.budget_exhausted': 'งบ AI ของวันนี้เต็ม ใช้ได้อีกครั้งหลังเที่ยงคืน หรือเพิ่มงบต่อวันที่ ตั้งค่า › AI',
  'ai.refused': 'AI ปฏิเสธที่จะตอบข้อความนี้',
  'ai.truncated': 'คำตอบของ AI ยาวเกินจนถูกตัด จึงไม่ได้ส่ง',
  'ai.invalid_output': 'คำตอบของ AI อยู่ในรูปแบบที่ใช้ไม่ได้ จึงไม่ได้ส่ง',
  'ai.unavailable': 'เรียก AI ไม่สำเร็จ ผู้ให้บริการไม่ตอบ ระบบจะลองอีกครั้งเมื่อมีข้อความใหม่',
  'ai.rate_limited': 'เรียก AI ถี่เกินโควตาของผู้ให้บริการ รอสักครู่',
  'ai.auth_failed': 'API key ของ AI ใช้ไม่ได้ ตรวจค่า ANTHROPIC_API_KEY บน Vercel',
  'ai.bad_request': 'ผู้ให้บริการ AI ไม่รับคำขอของระบบ แจ้งผู้พัฒนา',
  'ai.no_response': 'เรียก AI ไม่สำเร็จ ส่งคำขอแล้วแต่ไม่ได้คำตอบในเวลาที่กำหนด ระบบจะลองอีกครั้งเมื่อมีข้อความใหม่',
  'ai.link_not_allowed': 'คำตอบของ AI มีลิงก์ที่ไม่อยู่ในคลังความรู้หรือคำแนะนำสำหรับ AI จึงไม่ได้ส่ง',

  // Settings
  'settings.guard_topics_required': 'ใส่หัวข้ออย่างน้อยหนึ่งหัวข้อแล้วบันทึกก่อน จึงจะเปิดหรือทดลองขอบเขตหัวข้อได้',
  'settings.guard_rate_limited': 'ทดลองถี่เกินไป รอสักครู่แล้วลองใหม่',

  // Knowledge base
  'knowledge.rate_limited': 'อัปโหลด PDF ถี่เกินไป รอสักครู่แล้วลองใหม่',
  'knowledge.file_too_large': 'ไฟล์นี้ {size} MB เกินขีดจำกัด {maxMb} MB',
  'knowledge.not_pdf': 'รองรับเฉพาะไฟล์ PDF',
  'knowledge.duplicate': 'ไฟล์นี้อยู่ในคลังความรู้แล้ว',
  'knowledge.not_found': 'ไม่พบไฟล์นี้ในคลังความรู้ โหลดหน้าใหม่',
  'knowledge.not_retryable': 'ไฟล์นี้ไม่ได้อยู่ในสถานะไม่สำเร็จ โหลดหน้าใหม่',
  'knowledge.too_many_pages': 'ไฟล์มี {pageCount} หน้า เกินขีดจำกัด {maxPages} หน้า แยกไฟล์แล้วอัปโหลดใหม่',
  'knowledge.capacity_exceeded': 'คลังความรู้จะเกินเพดาน {over} token ลบไฟล์อื่นก่อนแล้วกด "ลองใหม่"',
  'knowledge.extract_failed': 'แปลงไฟล์ไม่สำเร็จ กด "ลองใหม่" แล้วเลือกไฟล์อีกครั้ง',
  'knowledge.extract_empty': 'ไม่พบข้อความที่อ่านได้ในไฟล์นี้ ใช้ไฟล์ที่มีข้อความ',
  'knowledge.extract_refused': 'AI ไม่แปลงไฟล์นี้ ตรวจเนื้อหาของไฟล์แล้วลองไฟล์อื่น',
  'knowledge.extract_interrupted':
    'แปลงไฟล์ไม่เสร็จเพราะระบบหยุดทำงานกลางคัน กด "ลองใหม่" แล้วเลือกไฟล์อีกครั้ง',

  // Client side
  // Created by the browser when the server gave no answer. Not part of `ERROR_CODES`.
  'client.network': commonCopy.error.network,
};

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

function fill(template: string, ctx: ErrorMessageContext): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = (ctx as Record<string, string | number | undefined>)[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Thai text of an error code, or `null` when the catalog shows no text for it. `ctx.variant`
 * picks the wording for codes shown in more than one place; `{...}` placeholders take their
 * values from `ctx` and stay as written when `ctx` has no value for them.
 */
export function errorMessage(code: ErrorMessageCode, ctx: ErrorMessageContext = {}): string | null {
  const entry: MessageEntry = ERROR_MESSAGES[code];
  if (entry === null) return null;
  if (typeof entry === 'string') return fill(entry, ctx);
  const variant = ctx.variant;
  const text = variant !== undefined && Object.hasOwn(entry, variant) ? entry[variant] : undefined;
  return fill(text ?? entry.default, ctx);
}

/** Codes that have an entry in the table, shown or not. */
export const ERROR_MESSAGE_CODES = Object.keys(ERROR_MESSAGES) as ErrorMessageCode[];

const HANDOFF_REASON_TEXT: Record<HandoffReason, string> = {
  customer_sent_image: 'ผู้ใช้ส่งรูป AI จึงหยุดรอแอดมิน',
  customer_sent_video: 'ผู้ใช้ส่งวิดีโอ AI จึงหยุดรอแอดมิน',
  customer_sent_non_text: 'ผู้ใช้ส่งข้อความที่ไม่ใช่ตัวอักษร เช่น เสียงหรือสติกเกอร์ AI จึงหยุดรอแอดมิน',
  budget_reached: 'งบ AI ของวันนี้เต็ม',
  ai_not_in_knowledge: 'AI ไม่พบคำตอบในคลังความรู้ จึงหยุดรอแอดมิน',
  ai_needs_human_action: 'ผู้ใช้ขอเรื่องที่ต้องให้คนจัดการ AI จึงหยุดรอแอดมิน',
  ai_unsafe_or_offtopic: 'ผู้ใช้คุยนอกเรื่องหรือใช้คำไม่เหมาะสม AI จึงหยุดรอแอดมิน',
  ai_other: 'AI ตอบเรื่องนี้ไม่ได้ จึงหยุดรอแอดมิน',
  ai_failed: 'AI ตอบไม่สำเร็จ จึงหยุดรอแอดมิน ดูรายละเอียดที่ ตั้งค่า › สถานะระบบ',
  ai_timeout: 'AI ตอบไม่ทันเวลา จึงหยุดรอแอดมิน',
  customer_asked_admin: 'ผู้ใช้กดปุ่มคุยกับแอดมิน AI ตอบแทนจึงปิด',
  ai_unavailable: 'ผู้ใช้กดปุ่มคุยกับ AI ขณะที่ AI ปิดทั้งระบบ จึงรอแอดมิน',
};

/** Text for a handoff reason the browser does not know. */
const HANDOFF_REASON_FALLBACK = 'แชทนี้รอแอดมิน';

/** Thai text of `Contact.needsAdminReason`. An unknown value gets the fallback text. */
export function handoffReasonText(reason: string): string {
  return Object.hasOwn(HANDOFF_REASON_TEXT, reason)
    ? HANDOFF_REASON_TEXT[reason as HandoffReason]
    : HANDOFF_REASON_FALLBACK;
}

const HANDOFF_EVENT_PREFIX = 'handoff.';

const EVENT_TEXT: Record<
  Exclude<EventCode, `${typeof HANDOFF_EVENT_PREFIX}${HandoffReason}`>,
  string
> = {
  'ai.turned_off_by_admin': 'คุณตอบเอง AI ตอบแทนของผู้ใช้คนนี้จึงปิด เปิดอีกครั้งได้ที่สวิตช์ด้านบน',
  'guard.blocked': 'นอกขอบเขตหัวข้อ AI จึงไม่ตอบ',
  'contact.followed': 'ผู้ใช้เพิ่มเพื่อน',
  'contact.unfollowed': 'ผู้ใช้เลิกติดตามแล้ว',
  'customer.tapped_ai_on': 'ผู้ใช้กดปุ่ม คุยกับ AI',
  'customer.tapped_admin': 'ผู้ใช้กดปุ่ม คุยกับแอดมิน',
  'customer.tapped_how_to': 'ผู้ใช้กดปุ่ม วิธีทดสอบ',
  'welcome.sent': 'ส่งข้อความต้อนรับแล้ว',
};

/**
 * Thai text of a `Message.eventCode`. `handoff.{reason}` uses the text of the reason. An unknown
 * code gives `null`, and the screen does not show that line.
 */
export function eventCodeText(code: string): string | null {
  if (code.startsWith(HANDOFF_EVENT_PREFIX)) {
    const reason = code.slice(HANDOFF_EVENT_PREFIX.length);
    return Object.hasOwn(HANDOFF_REASON_TEXT, reason)
      ? HANDOFF_REASON_TEXT[reason as HandoffReason]
      : null;
  }
  return Object.hasOwn(EVENT_TEXT, code) ? EVENT_TEXT[code as keyof typeof EVENT_TEXT] : null;
}
