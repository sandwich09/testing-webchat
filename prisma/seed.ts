/**
 * Docker sample data for the fictional shop "ต้นหอม คาเฟ่" (docs/architecture/data-model.md,
 * section "ข้อมูลตัวอย่าง (seed)"). Every person, id and credential here is fake.
 *
 * Idempotent: every row has a fixed id and is written with `createMany({ skipDuplicates: true })`;
 * `Settings` uses `upsert` with an empty `update`. A second run therefore changes nothing and never
 * overwrites what an admin edited. Times are computed back from the moment of the first run.
 *
 * Run with `NODE_OPTIONS=--conditions=react-server` (compose sets it): the system adapters import
 * `server-only`, which throws under plain Node.
 *
 * Reads only DATABASE_URL, CREDENTIALS_ENCRYPTION_KEY and APP_BASE_URL (not src/composition/env.ts).
 */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createLocalFileStorage } from '@/adapters/local-storage';
import { getPrismaClient } from '@/adapters/prisma';
import { createAesGcmCipher, createSystemClock } from '@/adapters/system';
import { computeCost, PRICE_TABLE } from '@/core/domain';
import type { StorageKey } from '@/core/domain';
import { STUB_CHANNEL_ACCESS_TOKEN, STUB_CHANNEL_SECRET } from '../e2e/fixtures/line/credentials';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`seed: ${name} is required`);
  return value;
};

// ---------------------------------------------------------------------------
// Fixed ids (UUIDv7, generated once). Changing one would add a second copy of its row.
// ---------------------------------------------------------------------------

const CONTACT_IDS = [
  '01a1ebf4-0400-7000-8000-005b1088d105',
  '01a1ebf4-07e8-7000-8000-053975b8923d',
  '01a1ebf4-0bd0-7000-8000-0ba002174124',
  '01a1ebf4-0fb8-7000-8000-0c4d061b1bcb',
  '01a1ebf4-13a0-7000-8000-11aa1e8add5d',
  '01a1ebf4-1788-7000-8000-14f75b5e07eb',
  '01a1ebf4-1b70-7000-8000-1bf0ffb2d629',
] as const;

const MESSAGE_IDS = [
  '01a1ebf4-1f58-7000-8000-1cca218d3244',
  '01a1ebf4-2340-7000-8000-2303e4a701ab',
  '01a1ebf4-2728-7000-8000-24f3afa25d43',
  '01a1ebf4-2b10-7000-8000-2843798893cb',
  '01a1ebf4-2ef8-7000-8000-2dbdc6cfe473',
  '01a1ebf4-32e0-7000-8000-30c65ef01e6d',
  '01a1ebf4-36c8-7000-8000-364d307d63bb',
  '01a1ebf4-3ab0-7000-8000-3bea12f7bdbf',
  '01a1ebf4-3e98-7000-8000-3fc177b6679b',
  '01a1ebf4-4280-7000-8000-42828ceb2650',
  '01a1ebf4-4668-7000-8000-46f766ac8974',
  '01a1ebf4-4a50-7000-8000-4afb393bf5a5',
  '01a1ebf4-4e38-7000-8000-4eea6128c255',
  '01a1ebf4-5220-7000-8000-51b08bd1a5a0',
  '01a1ebf4-5608-7000-8000-571b4bed99ec',
  '01a1ebf4-59f0-7000-8000-59281a7ab2de',
  '01a1ebf4-5dd8-7000-8000-5d29a37fd873',
  '01a1ebf4-61c0-7000-8000-61e1a9a719c3',
] as const;

const CANNED_REPLY_IDS = [
  '01a1ebf4-65a8-7000-8000-658fd832aeaf',
  '01a1ebf4-6990-7000-8000-69e90058b949',
  '01a1ebf4-6d78-7000-8000-6d2625d3dbe6',
  '01a1ebf4-7160-7000-8000-71810e4b815c',
] as const;

const KB_DOCUMENT_ID = '01a1ebf4-7548-7000-8000-763594bb5bfa';

const USAGE_IDS = [
  '01a1ebf4-7930-7000-8000-78368c9ff892',
  '01a1ebf4-7d18-7000-8000-7d8591455ef7',
  '01a1ebf4-8100-7000-8000-81ee5b70918c',
] as const;

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const runAt = Date.now();
/** The moment `offsetMs` before this run. */
const ago = (offsetMs: number): Date => new Date(runAt - offsetMs);

// ---------------------------------------------------------------------------
// Text and fixed values
// ---------------------------------------------------------------------------

const MALEE_ADMIN_NOTICE = 'ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ';
const AI_INSTRUCTIONS = 'ตอบสุภาพ เป็นกันเอง ถ้าลูกค้าถามเรื่องจัดเลี้ยงหรือสั่งจำนวนมาก ให้แอดมินตอบ';
const GUARD_TOPICS = ['มุกตลกไทย', 'มีมจากละครและซีรีส์', 'มุกจากภาพยนตร์'];

const CANNED_REPLIES = [
  { title: 'เวลาเปิดร้าน', text: 'ร้านเปิดทุกวัน 08:00–18:00 ค่ะ' },
  { title: 'ที่จอดรถ', text: 'มีที่จอดรถหน้าร้าน 4 คัน และจอดริมถนนได้ค่ะ' },
  { title: 'ช่องทางชำระเงิน', text: 'รับเงินสด โอนผ่านพร้อมเพย์ และบัตรเครดิตค่ะ' },
  { title: 'ขอบคุณ', text: 'ขอบคุณที่อุดหนุนต้นหอม คาเฟ่ ค่ะ' },
];

const MENU_TEXT = [
  'เมนูและราคา ต้นหอม คาเฟ่',
  'เครื่องดื่มร้อน',
  'เอสเปรสโซ 55 บาท',
  'ลาเต้ร้อน 60 บาท',
  'ชาไทยร้อน 50 บาท',
  'เครื่องดื่มเย็น',
  'ลาเต้เย็น 65 บาท',
  'ชาเขียวมัทฉะเย็น 75 บาท',
  'น้ำส้มคั้นสด 70 บาท',
  'ของหวาน',
  'เค้กส้ม 85 บาท',
  'บราวนี่ช็อกโกแลต 80 บาท',
  'เวลาเปิดปิด: ทุกวัน 08:00–18:00',
  'นโยบายจองโต๊ะ: จองล่วงหน้าได้สำหรับ 4 คนขึ้นไป โทรหรือแจ้งผ่าน LINE',
  'ชำระเงินได้ทั้งเงินสด พร้อมเพย์ และบัตรเครดิต',
].join('\n');

/** Nano-USD as the exact decimal string of a Decimal(18, 9) column. */
const nanoToDecimal = (nano: bigint): string =>
  `${String(nano / 1_000_000_000n)}.${String(nano % 1_000_000_000n).padStart(9, '0')}`;

const lineUserId = (n: number): string => `U${n.toString(16).padStart(32, '0')}`;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

type Draft = Readonly<{
  id: string;
  at: Date;
  /** Who wrote it. `customer` is inbound, `admin` and `ai` are outbound, `system` is a timeline event. */
  author: 'customer' | 'admin' | 'ai' | 'system';
  type: 'text' | 'image' | 'sticker' | 'event';
  text?: string;
  eventCode?: string;
  mediaUrl?: string;
  failed?: boolean;
}>;

interface ContactSeed {
  id: string;
  displayName: string;
  followStatus: 'following' | 'unfollowed';
  aiEnabled: boolean;
  unreadCount: number;
  needsAdmin: boolean;
  /** Messages, oldest first. */
  messages: readonly Draft[];
}

const buildContacts = (imageUrl: string): ContactSeed[] => {
  const m = MESSAGE_IDS;
  return [
    {
      id: CONTACT_IDS[0],
      displayName: 'มะลิ ใจดี',
      followStatus: 'following',
      aiEnabled: true,
      unreadCount: 1,
      needsAdmin: true,
      messages: [
        {
          id: m[0],
          at: ago(50 * MINUTE + 8 * SECOND),
          author: 'customer',
          type: 'text',
          text: 'สวัสดีค่ะ ร้านเปิดกี่โมงคะ',
        },
        {
          id: m[1],
          at: ago(50 * MINUTE),
          author: 'ai',
          type: 'text',
          text: 'ร้านเปิดทุกวัน 08:00–18:00 ค่ะ',
        },
        {
          id: m[2],
          at: ago(6 * MINUTE + 8 * SECOND),
          author: 'customer',
          type: 'text',
          text: 'รับจัดเลี้ยงนอกสถานที่ไหมคะ',
        },
        { id: m[3], at: ago(6 * MINUTE), author: 'ai', type: 'text', text: MALEE_ADMIN_NOTICE },
        {
          id: m[4],
          at: ago(6 * MINUTE - SECOND),
          author: 'system',
          type: 'event',
          eventCode: 'handoff.ai_needs_human_action',
        },
      ],
    },
    {
      id: CONTACT_IDS[1],
      displayName: 'พีช',
      followStatus: 'following',
      aiEnabled: false,
      unreadCount: 2,
      needsAdmin: false,
      messages: [
        { id: m[5], at: ago(2 * MINUTE), author: 'customer', type: 'text', text: 'มีเค้กส้มไหมคะ' },
        { id: m[6], at: ago(1 * MINUTE), author: 'customer', type: 'text', text: 'วันนี้ยังเหลือไหม' },
      ],
    },
    {
      id: CONTACT_IDS[2],
      displayName: 'Somchai K.',
      followStatus: 'following',
      aiEnabled: false,
      unreadCount: 0,
      needsAdmin: false,
      messages: [
        {
          id: m[7],
          at: ago(3 * HOUR + 2 * MINUTE),
          author: 'customer',
          type: 'text',
          text: 'จองโต๊ะ 4 คน บ่ายสองได้ไหมครับ',
        },
        {
          id: m[8],
          at: ago(3 * HOUR + 1 * MINUTE),
          author: 'admin',
          type: 'text',
          text: 'ได้ค่ะ จองไว้ให้แล้ว',
        },
        { id: m[9], at: ago(3 * HOUR), author: 'customer', type: 'text', text: 'ขอบคุณครับ' },
      ],
    },
    {
      id: CONTACT_IDS[3],
      displayName: 'ป้าแดง',
      followStatus: 'following',
      aiEnabled: false,
      unreadCount: 1,
      needsAdmin: false,
      messages: [
        {
          id: m[10],
          at: ago(1 * DAY + 1 * MINUTE),
          author: 'customer',
          type: 'text',
          text: 'ขอบคุณที่ส่งไวนะจ๊ะ',
        },
        { id: m[11], at: ago(1 * DAY), author: 'customer', type: 'sticker' },
      ],
    },
    {
      id: CONTACT_IDS[4],
      displayName: 'ต้นข้าว',
      followStatus: 'following',
      aiEnabled: false,
      unreadCount: 0,
      needsAdmin: false,
      messages: [
        {
          id: m[12],
          at: ago(2 * DAY + 1 * MINUTE),
          author: 'customer',
          type: 'image',
          mediaUrl: imageUrl,
        },
        {
          id: m[13],
          at: ago(2 * DAY),
          author: 'admin',
          type: 'text',
          text: 'ลาเต้เย็นแก้วนี้ 65 บาทค่ะ',
        },
      ],
    },
    {
      id: CONTACT_IDS[5],
      displayName: 'นนท์',
      followStatus: 'unfollowed',
      aiEnabled: false,
      unreadCount: 0,
      needsAdmin: false,
      messages: [
        {
          id: m[14],
          at: ago(4 * DAY + 1 * MINUTE),
          author: 'customer',
          type: 'text',
          text: 'ยกเลิกออเดอร์ครับ',
        },
        { id: m[15], at: ago(4 * DAY), author: 'admin', type: 'text', text: 'รับทราบค่ะ' },
      ],
    },
    {
      id: CONTACT_IDS[6],
      displayName: 'แพรวา',
      followStatus: 'following',
      aiEnabled: false,
      unreadCount: 0,
      needsAdmin: false,
      messages: [
        {
          id: m[16],
          at: ago(9 * DAY + 1 * MINUTE),
          author: 'customer',
          type: 'text',
          text: 'ส่งเมนูให้หน่อยค่ะ',
        },
        {
          id: m[17],
          at: ago(9 * DAY),
          author: 'admin',
          type: 'text',
          text: 'เดี๋ยวส่งให้นะคะ',
          failed: true,
        },
      ],
    },
  ];
};

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

const LAST_BY_TYPE = (d: Draft): boolean => d.type !== 'event';

const contactRow = (c: ContactSeed, index: number) => {
  const first = c.messages[0];
  // A timeline event is not a conversation message, so the list shows the last real message.
  const last = [...c.messages].reverse().find(LAST_BY_TYPE);
  if (first === undefined || last === undefined) throw new Error('seed: contact without messages');
  const joinedAt = new Date(first.at.getTime() - MINUTE);
  return {
    id: c.id,
    lineUserId: lineUserId(index + 1),
    displayName: c.displayName,
    pictureUrl: null,
    followStatus: c.followStatus,
    followedAt: joinedAt,
    aiEnabled: c.aiEnabled,
    needsAdmin: c.needsAdmin,
    needsAdminReason: c.needsAdmin ? ('ai_needs_human_action' as const) : null,
    aiState: 'idle' as const,
    unreadCount: c.unreadCount,
    lastMessageAt: last.at,
    lastMessagePreview: last.type === 'text' ? (last.text ?? null) : null,
    lastMessageBy: last.author,
    lastMessageType: last.type,
    createdAt: joinedAt,
  };
};

const messageRows = (contacts: readonly ContactSeed[]) =>
  contacts
    .flatMap((c, ci) =>
      c.messages.map((d, mi) => {
        const base = {
          id: d.id,
          contactId: c.id,
          text: d.text ?? null,
          createdAt: d.at,
        };
        if (d.author === 'system') {
          return {
            ...base,
            direction: 'internal' as const,
            author: 'system' as const,
            type: 'event' as const,
            eventCode: d.eventCode ?? null,
          };
        }
        if (d.author === 'customer') {
          return {
            ...base,
            direction: 'inbound' as const,
            author: 'customer' as const,
            type: d.type,
            // Fake LINE message id, unique per message.
            lineMessageId: `5${(ci * 10 + mi + 1).toString().padStart(14, '0')}`,
            ...(d.type === 'image'
              ? {
                  mediaUrl: d.mediaUrl ?? null,
                  previewUrl: d.mediaUrl ?? null,
                  mediaStatus: 'ready' as const,
                }
              : {}),
            // Sticker example from LINE's own documentation.
            ...(d.type === 'sticker' ? { stickerPackageId: '446', stickerId: '1988' } : {}),
          };
        }
        const failed = d.failed === true;
        return {
          ...base,
          direction: 'outbound' as const,
          author: d.author,
          type: 'text' as const,
          retryKey: d.id,
          deliveryStatus: failed ? ('failed' as const) : ('sent' as const),
          deliveryError: failed ? 'line.push_failed' : null,
          sentAt: failed ? null : d.at,
        };
      }),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL');
  const encryptionKey = requireEnv('CREDENTIALS_ENCRYPTION_KEY');
  const appBaseUrl = requireEnv('APP_BASE_URL');

  const prisma = getPrismaClient(databaseUrl);
  const cipher = createAesGcmCipher({ key: encryptionKey });
  // `put` signs nothing, so this secret only satisfies the factory and is never used or stored.
  const storage = createLocalFileStorage({
    rootDir: resolve('.data/uploads'),
    baseUrl: appBaseUrl,
    secret: randomBytes(32).toString('base64url'),
    clock: createSystemClock(),
  });

  try {
    // Sample image: copied into local file storage; the URL comes from the adapter. The key must
    // match the shape GET /api/local-storage serves (serve-local-media.use-case.ts), or the
    // seeded image answers 404 and the thread shows "could not load".
    const image = await readFile(join(import.meta.dirname, 'seed-assets', 'latte.jpg'));
    const stored = await storage.put(
      'inbound/seed-latte-sample-0001/original.jpg' as StorageKey,
      Readable.toWeb(Readable.from(image)) as ReadableStream<Uint8Array>,
      { contentType: 'image/jpeg', maxSizeBytes: image.length + 1 },
    );
    if (!stored.ok) throw new Error(`seed: storing the sample image failed (${stored.error.code})`);

    const contacts = buildContacts(stored.value.publicUrl);

    // Settings: upsert with an empty update, so a re-run never overwrites what an admin edited.
    // aiModel, aiDailyBudgetUsd and aiPoliteParticle are left to the schema defaults.
    await prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        lineChannelSecretEnc: cipher.encrypt(STUB_CHANNEL_SECRET),
        lineAccessTokenEnc: cipher.encrypt(STUB_CHANNEL_ACCESS_TOKEN),
        lineBotName: 'ต้นหอม คาเฟ่',
        lineBasicId: '@000test',
        aiEnabled: true,
        aiInstructions: AI_INSTRUCTIONS,
        guardEnabled: false,
        guardTopics: GUARD_TOPICS,
        lastWebhookAt: ago(MINUTE),
        updatedAt: ago(0),
      },
    });

    const created = {
      contacts: (
        await prisma.contact.createMany({ data: contacts.map(contactRow), skipDuplicates: true })
      ).count,
      messages: (
        await prisma.message.createMany({ data: messageRows(contacts), skipDuplicates: true })
      ).count,
      cannedReplies: (
        await prisma.cannedReply.createMany({
          data: CANNED_REPLIES.map((r, i) => ({
            id: CANNED_REPLY_IDS[i] as string,
            title: r.title,
            text: r.text,
            sortOrder: i + 1,
            createdAt: ago(7 * DAY),
            updatedAt: ago(7 * DAY),
          })),
          skipDuplicates: true,
        })
      ).count,
      documents: (
        await prisma.kbDocument.createMany({
          data: [
            {
              id: KB_DOCUMENT_ID,
              fileName: 'เมนูและราคา.pdf',
              sizeBytes: 182344,
              // Obviously fake digest.
              sha256: '5eed'.repeat(16),
              pageCount: 2,
              tokenCount: 1850,
              extractedText: MENU_TEXT,
              status: 'ready',
              createdAt: ago(3 * DAY),
              updatedAt: ago(3 * DAY),
            },
          ],
          skipDuplicates: true,
        })
      ).count,
    };

    // AiUsage: costs come from the same price function as the app. Tokens are made-up but realistic.
    const model = 'claude-opus-5-5';
    const usage = (
      inputTokens: number,
      outputTokens: number,
      cacheReadTokens: number,
      cacheWriteTokens: number,
    ) => ({
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    });
    const aiMessages = contacts[0]?.messages.filter((d) => d.author === 'ai') ?? [];
    const usageRows = [
      {
        id: USAGE_IDS[0],
        kind: 'ingest' as const,
        documentId: KB_DOCUMENT_ID,
        contactId: null,
        messageId: null,
        tokens: usage(3100, 1850, 0, 0),
        outcome: 'ok' as const,
        at: ago(3 * DAY),
      },
      {
        id: USAGE_IDS[1],
        kind: 'reply' as const,
        documentId: null,
        contactId: CONTACT_IDS[0],
        messageId: aiMessages[0]?.id ?? null,
        tokens: usage(420, 24, 0, 1850),
        outcome: 'ok' as const,
        at: aiMessages[0]?.at ?? ago(50 * MINUTE),
      },
      {
        id: USAGE_IDS[2],
        kind: 'reply' as const,
        documentId: null,
        contactId: CONTACT_IDS[0],
        messageId: aiMessages[1]?.id ?? null,
        tokens: usage(460, 31, 1850, 0),
        outcome: 'handoff' as const,
        at: aiMessages[1]?.at ?? ago(6 * MINUTE),
      },
    ];
    const usages = (
      await prisma.aiUsage.createMany({
        data: usageRows.map((u) => ({
          id: u.id,
          kind: u.kind,
          contactId: u.contactId,
          messageId: u.messageId,
          documentId: u.documentId,
          provider: 'claude',
          model,
          ...u.tokens,
          costUsd: nanoToDecimal(computeCost(u.tokens, model, PRICE_TABLE).cost),
          outcome: u.outcome,
          createdAt: u.at,
        })),
        skipDuplicates: true,
      })
    ).count;

    // Counts only: no message text or credential ever goes to the log.
    console.log(`seed done. inserted this run: ${JSON.stringify({ ...created, usages })}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('seed failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
