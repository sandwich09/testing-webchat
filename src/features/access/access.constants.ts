// Thai copy of the welcome page. Keys follow docs/specs/ui-copy.md: `access.cover.badge` is
// `copy.cover.badge`. Wrong code and rate limit come from the server (error-messages.ts).

export const copy = {
  cover: {
    badge: 'ยินดีต้อนรับสู่',
    title: 'Test webchat',
    subtitle: 'application',
  },
  form: {
    label: 'รหัสเข้าใช้',
    placeholder: 'รหัสเข้าใช้',
    showCode: 'แสดงรหัสเข้าใช้',
    hideCode: 'ซ่อนรหัสเข้าใช้',
    submit: 'เข้าระบบ',
    submitting: 'กำลังเข้าระบบ',
  },
  error: {
    empty: 'กรุณาใส่รหัสเข้าใช้',
  },
} as const;
