// Thai copy and values shared by every screen. Keys follow docs/specs/ui-copy.md:
// `common.nav.inbox` is `copy.nav.inbox`. `{name}` is replaced when the text is shown.

/** `apiFetch` gets `client.network` when there is no answer within this time. */
export const CLIENT_REQUEST_TIMEOUT_MS = 15000;
/** Longest polling interval while requests keep failing. */
export const POLL_BACKOFF_MAX_MS = 30000;
/** The connection banner shows after this many failures in a row. */
export const POLL_FAILURES_BEFORE_BANNER = 2;
/** How long a success toast stays on screen. */
export const TOAST_DURATION_MS = 4000;
/** How long an error toast stays on screen. */
export const TOAST_ERROR_DURATION_MS = 6000;

/** Background colours of the fallback avatar. Each passes 4.5:1 contrast with white text. */
export const AVATAR_COLORS = [
  '#C2185B',
  '#6A1B9A',
  '#1565C0',
  '#00695C',
  '#AD4A00',
  '#4E342E',
] as const;

export const copy = {
  appName: 'Test webchat application',
  skipToContent: 'ข้ามไปที่เนื้อหา',
  nav: {
    label: 'เมนูหลัก',
    inbox: 'แชท',
    settings: 'ตั้งค่า',
    logout: 'ออกจากระบบ',
    collapse: 'พับเมนู',
    expand: 'กางเมนู',
    unreadAria: '{n} แชทยังไม่อ่าน',
  },
  action: {
    retry: 'ลองอีกครั้ง',
    cancel: 'ยกเลิก',
    close: 'ปิด',
    save: 'บันทึก',
  },
  connection: {
    banner: 'การเชื่อมต่อมีปัญหา กำลังลองใหม่',
  },
  error: {
    section: 'ส่วนนี้แสดงไม่ได้',
    network: 'เชื่อมต่อระบบไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง',
  },
  toast: {
    saved: 'บันทึกแล้ว',
  },
  loading: 'กำลังโหลด',
  time: {
    today: 'วันนี้',
    yesterday: 'เมื่อวาน',
  },
} as const;
