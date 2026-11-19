import { describe, expect, it } from 'vitest';

import { ApiError } from '@/common/common.api';

import {
  credentialErrorText,
  lastWebhookText,
  lineAccountText,
  lineFailureResult,
  lineStatusView,
  secretStatusView,
  testOkText,
  testResult,
} from './LineSettingsSection';

describe('lineStatusView', () => {
  it('has exactly the three documented states', () => {
    expect(lineStatusView('connected')).toEqual({ text: 'เชื่อมต่อแล้ว', tone: 'success' });
    expect(lineStatusView('error')).toEqual({ text: 'เชื่อมต่อมีปัญหา', tone: 'danger' });
    expect(lineStatusView('not_configured')).toEqual({ text: 'ยังไม่ได้เชื่อมต่อ', tone: 'muted' });
  });
});

describe('lineAccountText', () => {
  it('joins the OA name and the Basic ID', () => {
    expect(lineAccountText({ botName: 'Tonhom Cafe', basicId: '@tonhom' })).toBe(
      'Tonhom Cafe · Basic ID @tonhom',
    );
  });

  it('leaves out what is missing', () => {
    expect(lineAccountText({ botName: 'Tonhom Cafe', basicId: null })).toBe('Tonhom Cafe');
    expect(lineAccountText({ botName: null, basicId: '@tonhom' })).toBe('Basic ID @tonhom');
    expect(lineAccountText({ botName: '', basicId: '' })).toBeNull();
    expect(lineAccountText({ botName: null, basicId: null })).toBeNull();
  });
});

describe('lastWebhookText', () => {
  const now = new Date('2026-11-18T08:00:00Z');

  it('shows the Thai time of the last webhook', () => {
    expect(lastWebhookText('2026-11-18T07:32:00Z', now)).toBe('รับข้อความล่าสุด 18 พ.ย. 14:32');
  });

  it('says so when none was received', () => {
    expect(lastWebhookText(null, now)).toBe('ยังไม่เคยรับข้อความ');
  });
});

describe('results', () => {
  it('names the OA in the success line', () => {
    expect(testOkText('Tonhom Cafe')).toBe('เชื่อมต่อได้ OA ชื่อ Tonhom Cafe');
  });

  it('turns an API error into catalog text and keeps the code', () => {
    const result = lineFailureResult(new ApiError('line.credentials_invalid', 400));
    expect(result).toEqual({
      kind: 'error',
      code: 'line.credentials_invalid',
      text: 'Channel access token ไม่ถูกต้อง ตรวจค่าที่คัดลอกมาอีกครั้ง',
    });
  });

  it('uses the settings wording of LINE being unreachable', () => {
    expect(lineFailureResult(new ApiError('line.unavailable', 502))).toMatchObject({
      text: 'ติดต่อ LINE ไม่ได้ ลองอีกครั้งในอีกสักครู่',
    });
  });

  it('treats an unknown error as an unexpected one', () => {
    expect(lineFailureResult(new Error('x'))).toMatchObject({ code: 'internal.unexpected' });
  });

  it('has a message for each required credential', () => {
    expect(credentialErrorText('channelId')).toBe('ใส่ Channel ID');
    expect(credentialErrorText('channelSecret')).toBe('ใส่ Channel secret');
    expect(credentialErrorText('channelAccessToken')).toBe('ใส่ Channel access token');
  });

  it('says what a Channel ID may hold, with the documented maximum', () => {
    expect(credentialErrorText('channelId', 'invalid')).toBe(
      'Channel ID เป็นตัวเลขเท่านั้น ไม่เกิน 20 หลัก',
    );
  });

  it('names the Channel ID and channel secret pair LINE refused', () => {
    expect(lineFailureResult(new ApiError('line.channel_secret_invalid', 422))).toEqual({
      kind: 'error',
      code: 'line.channel_secret_invalid',
      text: 'Channel ID กับ Channel secret ไม่ตรงกัน ตรวจว่าคัดลอกทั้งสองค่ามาจาก channel เดียวกัน',
    });
  });
});

describe('secret status', () => {
  it('has a text and a tone for each documented state', () => {
    expect(secretStatusView('verified')).toEqual({
      text: 'LINE ยืนยันแล้วว่า Channel secret ตรงกับ Channel ID',
      tone: 'muted',
    });
    expect(secretStatusView('unchecked').tone).toBe('warn');
    expect(secretStatusView('unchecked').text).toContain('ทดสอบการเชื่อมต่อ');
    expect(secretStatusView('no_channel_id').tone).toBe('warn');
    expect(secretStatusView('no_channel_id').text).toContain('Channel ID');
  });

  it('makes a passed test a warning unless LINE confirmed the secret now', () => {
    expect(testResult({ botName: 'Tonhom Cafe', secretStatus: 'verified' })).toEqual({
      kind: 'ok',
      text: 'เชื่อมต่อได้ OA ชื่อ Tonhom Cafe · LINE ยืนยันแล้วว่า Channel secret ตรงกับ Channel ID',
    });
    expect(testResult({ botName: 'Tonhom Cafe', secretStatus: 'unchecked' }).kind).toBe('warning');
    expect(testResult({ botName: 'Tonhom Cafe', secretStatus: 'no_channel_id' }).kind).toBe(
      'warning',
    );
  });
});
