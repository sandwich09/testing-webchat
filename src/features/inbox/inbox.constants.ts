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

/** How long a message stays highlighted after a quote jumped to it. */
export const QUOTE_HIGHLIGHT_MS = 1600;

export const copy = {
  list: {
    title: 'แชท',
    searchPlaceholder: 'ค้นหาชื่อผู้ใช้',
    clearSearch: 'ล้างคำค้นหา',
    tabsLabel: 'ตัวกรองแชท',
    tabAll: 'ทั้งหมด',
    tabUnread: 'ยังไม่อ่าน',
    tabNeedsAdmin: 'รอแอดมิน',
    unreadAria: '{n} ข้อความยังไม่อ่าน',
    emptyNoLine: {
      title: 'ยังไม่มีผู้ใช้ทักมา',
      body: 'เชื่อม LINE Official Account ที่หน้าตั้งค่า แล้วเพิ่มเพื่อนจากแอป LINE เพื่อเริ่มแชท',
    },
    goToSettings: 'ไปที่ตั้งค่า',
    empty: {
      title: 'ยังไม่มีผู้ใช้ทักมา',
      body: 'เมื่อผู้ใช้เพิ่ม LINE Official Account เป็นเพื่อนแล้วทักมา แชทจะขึ้นที่นี่',
    },
    emptyUnread: 'ไม่มีแชทที่ยังไม่อ่าน',
    emptyNeedsAdmin: 'ไม่มีแชทที่รอแอดมิน',
    emptySearch: 'ไม่พบผู้ใช้ชื่อ “{q}”',
    error: 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ',
  },
  contact: {
    unnamed: 'ผู้ใช้ไม่มีชื่อ',
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
    audio: 'ข้อความเสียง',
    audioPlay: 'เล่นข้อความเสียง',
    audioPause: 'หยุดข้อความเสียงชั่วคราว',
    audioProgress: 'ตำแหน่งที่เล่นของข้อความเสียง',
    audioLoading: 'กำลังโหลดข้อความเสียง',
    audioFailed: 'โหลดข้อความเสียงไม่สำเร็จ',
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
    problem: {
      too_large: 'ไฟล์ใหญ่เกิน {maxMb} MB ที่ระบบเก็บได้ ดูได้ในแอป LINE',
      unsupported_type: 'ชนิดไฟล์นี้แสดงในหน้านี้ไม่ได้ ดูได้ในแอป LINE',
      external_source: 'ไฟล์มาจากลิงก์นอก LINE ระบบไม่ดึงไฟล์นี้ ดูได้ในแอป LINE',
      download_failed: 'ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จ ดูได้ในแอป LINE',
      interrupted: 'ระบบหยุดก่อนเก็บไฟล์เสร็จ ดูได้ในแอป LINE',
    },
    play: 'เล่นวิดีโอ',
    openImage: 'เปิดรูปขนาดเต็ม',
  },
  thread: {
    back: 'กลับไปที่รายชื่อ',
    following: 'ติดตามอยู่',
    aiHelping: 'AI กำลังช่วยตอบ',
    needsAdmin: 'รอแอดมิน',
    showInfo: 'แสดงข้อมูลผู้ใช้',
    hideInfo: 'ซ่อนข้อมูลผู้ใช้',
    logLabel: 'ข้อความในแชท',
    placeholder: 'เลือกแชทจากรายชื่อเพื่อเริ่มตอบ',
    empty: 'ยังไม่มีข้อความในแชทนี้',
    error: 'โหลดข้อความไม่สำเร็จ',
    notFound: 'ไม่พบแชทนี้',
    backToList: 'กลับไปที่รายชื่อ',
    loadingOlder: 'กำลังโหลดข้อความก่อนหน้า',
    newMessages: 'ข้อความใหม่',
  },
  welcome: {
    label: 'ข้อความต้อนรับ',
    sender: 'ส่งอัตโนมัติ',
    buttonsLabel: 'ปุ่มในการ์ด: {buttons}',
  },
  ai: {
    label: 'AI ตอบแทน',
    labelKilled: 'AI ปิดจากหน้าตั้งค่า',
    noteOff: 'เปิดเพื่อให้ AI ตอบผู้ใช้คนนี้จากคลังความรู้',
    noteOn: 'AI ตอบผู้ใช้คนนี้ และปิดเองเมื่อคุณส่งข้อความ',
    noteKilled: 'AI ถูกปิดทั้งระบบ เปิดได้ที่ ตั้งค่า › AI',
    noteUnfollowed: 'ผู้ใช้เลิกติดตามแล้ว AI จึงตอบไม่ได้',
  },
  quote: {
    label: 'ตอบกลับ {name}: {text}',
    labelUnavailable: 'ตอบกลับข้อความที่ไม่พร้อมแสดง',
    unavailable: 'ข้อความต้นทางไม่พร้อมแสดง',
    jumpHint: 'ไปที่ข้อความต้นทาง',
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
    /** Shown as the attach button's tooltip (wide screens) and its description. */
    attachHint: 'รูป JPEG, PNG, WebP, HEIC ไม่เกิน {imageMaxMb} MB · วิดีโอ MP4 ไม่เกิน {videoMaxMb} MB',
    waitUpload: 'ส่งได้เมื่ออัปโหลดเสร็จ',
    disabled: {
      unfollowed: 'ส่งข้อความหาผู้ใช้ที่เลิกติดตามแล้วไม่ได้',
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
      unsupported_type: 'รองรับเฉพาะรูป JPEG, PNG, WebP, HEIC และวิดีโอ MP4',
      mov_not_supported: 'วิดีโอ MOV ส่งไม่ได้ แปลงเป็น MP4 แล้วแนบใหม่',
      image_too_large: 'รูปต้องไม่เกิน {maxMb} MB ไฟล์นี้ {sizeMb} MB',
      video_too_large: 'วิดีโอต้องไม่เกิน {maxMb} MB ไฟล์นี้ {sizeMb} MB',
      empty_file: 'ไฟล์นี้ว่างเปล่า เลือกไฟล์อื่น',
      convertFailed: 'แปลงรูปนี้ไม่ได้ ใช้ไฟล์ JPEG หรือ PNG แทน',
      uploadFailed: 'อัปโหลดไม่สำเร็จ แนบไฟล์อีกครั้ง',
    },
  },
  notes: {
    title: 'โน้ต (เห็นเฉพาะแอดมิน)',
    hint: 'ผู้ใช้และ AI ไม่เห็นโน้ตนี้',
    inputLabel: 'โน้ตใหม่',
    placeholder: 'พิมพ์โน้ตเกี่ยวกับผู้ใช้',
    keys: 'Enter เพิ่ม · Shift+Enter ขึ้นบรรทัดใหม่',
    add: 'เพิ่มโน้ต',
    counter: '{n}/{max}',
    empty: 'ยังไม่มีโน้ต',
    error: 'โหลดโน้ตไม่สำเร็จ',
    saving: 'กำลังบันทึก',
    tooLong: 'โน้ตยาวเกิน {max} ตัวอักษร',
    addFailed: 'เพิ่มโน้ตไม่สำเร็จ ข้อความที่พิมพ์ยังอยู่ ลองอีกครั้ง',
    delete: 'ลบโน้ตที่เขียนเมื่อ {date}',
    deleteTitle: 'ลบโน้ตนี้ไหม',
    deleteDescription: 'ลบแล้วกู้คืนไม่ได้',
    deleteConfirm: 'ลบโน้ต',
    deleted: 'ลบโน้ตแล้ว',
  },
  info: {
    title: 'ข้อมูลผู้ใช้',
    close: 'ปิดข้อมูลผู้ใช้',
    followedAt: 'เพิ่มเพื่อนเมื่อ {date}',
    status: 'สถานะ',
    messageCount: 'ข้อความทั้งหมด',
    aiReplyCount: 'AI ตอบไปแล้ว',
    timesValue: '{n} ครั้ง',
    lastContact: 'ทักล่าสุด',
    error: 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ',
  },
  lightbox: {
    label: 'ดูสื่อขนาดเต็ม',
    openOriginal: 'เปิดไฟล์ในแท็บใหม่',
    close: 'ปิด',
  },
} as const;
