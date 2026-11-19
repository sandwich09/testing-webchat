// Thai copy and values of the chat screens. Keys follow docs/specs/ui-copy.md:
// `inbox.list.title` is `copy.list.title`. `{name}` is replaced when the text is shown.
// Texts of handoff reasons and event lines live in src/common/error-messages.ts.

/** The composer sends a typing ping at most once per this interval. */
export const TYPING_PING_INTERVAL_MS = 15000;
/** A send with no answer is treated as failed after this time. */
export const SEND_UNCONFIRMED_TIMEOUT_MS = 15000;
/** Messages at most this far apart stay in one group. */
export const GROUP_GAP_MS = 300000;
/** Debounce of the contact search box. */
export const SEARCH_DEBOUNCE_MS = 300;
/** Delay before the unread count of an open chat is cleared. */
export const MARK_READ_DELAY_MS = 1000;
/** Within this distance from the bottom the thread counts as at the bottom. */
export const STICK_TO_BOTTOM_PX = 80;
/** Distance from the top at which older messages start loading. */
export const LOAD_OLDER_THRESHOLD_PX = 200;

export const copy = {
  list: {
    title: 'แชท',
    searchPlaceholder: 'ค้นหาชื่อลูกค้า',
    clearSearch: 'ล้างคำค้นหา',
    tabsLabel: 'ตัวกรองแชท',
    tabAll: 'ทั้งหมด',
    tabUnread: 'ยังไม่อ่าน',
    tabNeedsAdmin: 'รอแอดมิน',
    unreadAria: '{n} ข้อความยังไม่อ่าน',
    emptyNoLine: {
      title: 'ยังไม่มีลูกค้าทักมา',
      body: 'เชื่อม LINE Official Account ที่หน้าตั้งค่า แล้วเพิ่มเพื่อนจากแอป LINE เพื่อเริ่มแชท',
    },
    goToSettings: 'ไปที่ตั้งค่า',
    empty: {
      title: 'ยังไม่มีลูกค้าทักมา',
      body: 'เมื่อลูกค้าเพิ่ม LINE Official Account เป็นเพื่อนแล้วทักมา แชทจะขึ้นที่นี่',
    },
    emptyUnread: 'ไม่มีแชทที่ยังไม่อ่าน',
    emptyNeedsAdmin: 'ไม่มีแชทที่รอแอดมิน',
    emptySearch: 'ไม่พบลูกค้าชื่อ “{q}”',
    error: 'โหลดรายชื่อลูกค้าไม่สำเร็จ',
  },
  contact: {
    unnamed: 'ลูกค้าไม่มีชื่อ',
    unfollowed: 'เลิกติดตามแล้ว',
  },
  preview: {
    you: 'คุณ:',
    ai: 'AI:',
    needsAdmin: 'รอแอดมิน ·',
    none: 'ยังไม่มีข้อความ',
  },
  media: {
    image: 'รูปภาพ',
    video: 'วิดีโอ',
    sticker: 'สติกเกอร์',
    other: {
      audio: '[เสียง]',
      file: '[ไฟล์]',
      location: '[ตำแหน่ง]',
      unknown: '[ข้อความชนิดอื่น]',
    },
    otherHint: 'ดูได้ในแอป LINE เท่านั้น',
    loading: 'กำลังโหลดรูป',
    imageFailed: 'โหลดรูปไม่สำเร็จ',
    videoFailed: 'โหลดวิดีโอไม่สำเร็จ',
    tooLarge: 'ไฟล์ใหญ่เกินกว่าจะเก็บได้ ดูได้ในแอป LINE',
    play: 'เล่นวิดีโอ',
    openImage: 'เปิดรูปขนาดเต็ม',
  },
  thread: {
    back: 'กลับไปที่รายชื่อ',
    following: 'ติดตามอยู่',
    aiHelping: 'AI กำลังช่วยตอบ',
    needsAdmin: 'รอแอดมิน',
    showInfo: 'แสดงข้อมูลลูกค้า',
    hideInfo: 'ซ่อนข้อมูลลูกค้า',
    logLabel: 'ข้อความในแชท',
    placeholder: 'เลือกแชทจากรายชื่อเพื่อเริ่มตอบ',
    empty: 'ยังไม่มีข้อความในแชทนี้',
    error: 'โหลดข้อความไม่สำเร็จ',
    notFound: 'ไม่พบแชทนี้',
    backToList: 'กลับไปที่รายชื่อ',
    loadingOlder: 'กำลังโหลดข้อความก่อนหน้า',
    newMessages: 'ข้อความใหม่',
  },
  ai: {
    label: 'AI ตอบแทน',
    labelKilled: 'AI ปิดจากหน้าตั้งค่า',
    noteOff: 'เปิดเพื่อให้ AI ตอบลูกค้าคนนี้จากคลังความรู้',
    noteOn: 'AI ตอบลูกค้าคนนี้ และปิดเองเมื่อคุณส่งข้อความ',
    noteKilled: 'AI ถูกปิดทั้งระบบ เปิดได้ที่ ตั้งค่า › AI ตอบแทน',
    noteUnfollowed: 'ลูกค้าเลิกติดตามแล้ว AI จึงตอบไม่ได้',
  },
  message: {
    senderYou: 'คุณ',
    senderAi: 'AI',
    sending: 'กำลังส่ง',
    sent: 'ส่งแล้ว',
    failed: 'ส่งไม่สำเร็จ',
    retry: 'ส่งอีกครั้ง',
  },
  composer: {
    placeholder: 'พิมพ์ข้อความ',
    hint: 'Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่',
    send: 'ส่ง',
    attach: 'แนบรูปหรือวิดีโอ',
    waitUpload: 'ส่งได้เมื่ออัปโหลดเสร็จ',
    disabled: {
      unfollowed: 'ส่งข้อความหาลูกค้าที่เลิกติดตามแล้วไม่ได้',
      lineNotConfigured: 'เชื่อม LINE Official Account ที่หน้าตั้งค่าก่อนจึงจะส่งข้อความได้',
    },
  },
  attach: {
    preparing: 'กำลังเตรียมไฟล์',
    uploading: 'กำลังอัปโหลด {percent}%',
    uploadingNoPercent: 'กำลังอัปโหลด',
    ready: 'พร้อมส่ง',
    cancel: 'ยกเลิกไฟล์แนบ',
    remove: 'นำไฟล์แนบออก',
    error: {
      unsupported_type: 'รองรับเฉพาะรูป JPEG, PNG, HEIC, WebP และวิดีโอ MP4',
      mov_not_supported: 'วิดีโอ MOV ส่งไม่ได้ แปลงเป็น MP4 แล้วแนบใหม่',
      image_too_large: 'รูปต้องไม่เกิน {maxMb} MB ไฟล์นี้ {sizeMb} MB',
      video_too_large: 'วิดีโอต้องไม่เกิน {maxMb} MB ไฟล์นี้ {sizeMb} MB',
      empty_file: 'ไฟล์นี้ว่างเปล่า เลือกไฟล์อื่น',
      convertFailed: 'แปลงรูปนี้ไม่ได้ ใช้ไฟล์ JPEG หรือ PNG แทน',
      uploadFailed: 'อัปโหลดไม่สำเร็จ แนบไฟล์อีกครั้ง',
    },
  },
  info: {
    title: 'ข้อมูลลูกค้า',
    close: 'ปิดข้อมูลลูกค้า',
    followedAt: 'เพิ่มเพื่อนเมื่อ {date}',
    status: 'สถานะ',
    messageCount: 'ข้อความทั้งหมด',
    aiReplyCount: 'AI ตอบไปแล้ว',
    timesValue: '{n} ครั้ง',
    lastContact: 'ทักล่าสุด',
    error: 'โหลดข้อมูลลูกค้าไม่สำเร็จ',
  },
  lightbox: {
    label: 'ดูสื่อขนาดเต็ม',
    openOriginal: 'เปิดไฟล์ในแท็บใหม่',
    close: 'ปิด',
  },
} as const;
