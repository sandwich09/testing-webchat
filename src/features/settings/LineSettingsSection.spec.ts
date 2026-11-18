import { describe, expect, it } from 'vitest';

import { ApiError } from '@/common/common.api';

import {
  credentialErrorText,
  lastWebhookText,
  lineAccountText,
  lineFailureResult,
  lineStatusView,
  testOkText,
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
    expect(credentialErrorText('channelSecret')).toBe('ใส่ Channel secret');
    expect(credentialErrorText('channelAccessToken')).toBe('ใส่ Channel access token');
  });
});
