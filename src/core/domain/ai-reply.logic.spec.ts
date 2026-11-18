import { describe, expect, it } from 'vitest';
import { sanitizeAiReply } from './ai-reply.logic';
import { AI_REPLY_MAX_CHARS } from './constants';

describe('sanitizeAiReply', () => {
  it('step 1: converts CRLF and trims the edges', () => {
    expect(sanitizeAiReply('  สวัสดีค่ะ\r\nมีอะไรให้ช่วยคะ \r\n')).toBe('สวัสดีค่ะ\nมีอะไรให้ช่วยคะ');
  });

  it('step 2: removes bold and underline markers around words', () => {
    expect(sanitizeAiReply('ราคา **60 บาท** และ __70 บาท__')).toBe('ราคา 60 บาท และ 70 บาท');
  });

  it('step 2: removes every backtick', () => {
    expect(sanitizeAiReply('ใช้ `code` และ ```x```')).toBe('ใช้ code และ x');
  });

  it('step 2: removes one to six leading # with the space after', () => {
    expect(sanitizeAiReply('# หัวข้อ\n###### ย่อย\nเนื้อหา #1')).toBe('หัวข้อ\nย่อย\nเนื้อหา #1');
  });

  it('step 2: does not treat seven # as a heading marker', () => {
    expect(sanitizeAiReply('####### x')).toBe('####### x');
  });

  it('step 2: removes a leading > quote marker', () => {
    expect(sanitizeAiReply('> อ้างอิง\nไม่ใช่ a > b')).toBe('อ้างอิง\nไม่ใช่ a > b');
  });

  it('step 3: turns - and * list markers into bullets', () => {
    expect(sanitizeAiReply('- กาแฟ\n* ชา\nไม่ใช่ a - b')).toBe('• กาแฟ\n• ชา\nไม่ใช่ a - b');
  });

  it('step 4: turns markdown links into "text url"', () => {
    expect(sanitizeAiReply('ดูที่ [เมนู](https://example.com/menu) นะคะ')).toBe(
      'ดูที่ เมนู https://example.com/menu นะคะ',
    );
  });

  it('step 5: collapses several blank lines to one', () => {
    expect(sanitizeAiReply('ก\n\n\n\nข\n \n \nค\n\nง')).toBe('ก\n\nข\n\nค\n\nง');
  });

  it('step 6: trims again after the cleaning', () => {
    expect(sanitizeAiReply('**  **\nสวัสดี')).toBe('สวัสดี');
  });

  it('returns null when the result is empty', () => {
    expect(sanitizeAiReply('')).toBeNull();
    expect(sanitizeAiReply('   \r\n ')).toBeNull();
    expect(sanitizeAiReply('```')).toBeNull();
  });

  it('keeps text of exactly the max length and rejects one more', () => {
    expect(sanitizeAiReply('ก'.repeat(AI_REPLY_MAX_CHARS))).toBe('ก'.repeat(AI_REPLY_MAX_CHARS));
    expect(sanitizeAiReply('ก'.repeat(AI_REPLY_MAX_CHARS + 1))).toBeNull();
  });

  it('measures the length after cleaning', () => {
    expect(sanitizeAiReply(`**${'ก'.repeat(AI_REPLY_MAX_CHARS)}**`)).toBe(
      'ก'.repeat(AI_REPLY_MAX_CHARS),
    );
  });

  it('leaves the polite particle and plain text alone', () => {
    expect(sanitizeAiReply('ลาเต้เย็น 80 บาทค่ะ')).toBe('ลาเต้เย็น 80 บาทค่ะ');
  });
});
