import type { RichMenuSpec, WelcomeCard } from '@/core/domain';

// LINE JSON of the rich menu and of the welcome card, typed so a shape error fails typecheck.
// Shapes follow LINE's Messaging API reference as known when written (ต้องยืนยันกับเอกสาร LINE):
// rich menu object, Flex bubble with a box `background` of type `linearGradient`, and postback
// actions with `displayText`.

type FlexText = {
  type: 'text';
  text: string;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  weight?: 'regular' | 'bold';
  color?: string;
  wrap?: boolean;
};
type FlexImage = {
  type: 'image';
  url: string;
  size: 'xxs' | 'xs' | 'sm';
  aspectMode: 'cover' | 'fit';
  aspectRatio: '1:1';
  flex: 0;
};
type PostbackAction = { type: 'postback'; label: string; data: string; displayText: string };
type FlexButton = {
  type: 'button';
  style: 'primary' | 'secondary' | 'link';
  height: 'sm' | 'md';
  color?: string;
  action: PostbackAction;
};
type FlexBox = {
  type: 'box';
  layout: 'horizontal' | 'vertical';
  contents: (FlexBox | FlexText | FlexImage | FlexButton)[];
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  paddingAll?: string;
  justifyContent?: 'center' | 'flex-start';
  alignItems?: 'center' | 'flex-start';
  cornerRadius?: string;
  backgroundColor?: string;
  background?: {
    type: 'linearGradient';
    angle: string;
    startColor: string;
    centerColor: string;
    endColor: string;
  };
};
export type FlexMessage = {
  type: 'flex';
  altText: string;
  contents: { type: 'bubble'; size: 'kilo'; header: FlexBox; body: FlexBox; footer: FlexBox };
};

/** Colours of app/globals.css (the brand gradient and the accent). */
const BRAND = { start: '#FF8A1F', center: '#F0055A', end: '#C90B5E', accent: '#D6094F' };
const FG = '#1B1320';
const MUTED = '#6B5F70';

/** LINE limits a button label to 20 characters and alt text to 400 (ต้องยืนยัน). */
const LABEL_MAX = 20;
const ALT_MAX = 400;

export function toFlexWelcome(card: WelcomeCard): FlexMessage {
  const title: FlexBox = {
    type: 'box',
    layout: 'vertical',
    contents: [
      { type: 'text', text: card.titleLine, size: 'sm', color: '#FFFFFF' },
      {
        type: 'text',
        text: card.accountName,
        size: 'lg',
        weight: 'bold',
        color: '#FFFFFF',
        wrap: true,
      },
    ],
  };
  const logo: FlexImage | FlexBox =
    card.logoUrl === null
      ? {
          // A text-only tile stands in for the picture when there is no HTTPS URL.
          type: 'box',
          layout: 'vertical',
          justifyContent: 'center',
          alignItems: 'center',
          cornerRadius: '8px',
          backgroundColor: '#FFFFFF38',
          paddingAll: '8px',
          contents: [{ type: 'text', text: 'T', weight: 'bold', size: 'lg', color: '#FFFFFF' }],
        }
      : {
          type: 'image',
          url: card.logoUrl,
          size: 'xxs',
          aspectMode: 'cover',
          aspectRatio: '1:1',
          flex: 0,
        };
  return {
    type: 'flex',
    altText: card.altText.slice(0, ALT_MAX),
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        paddingAll: '16px',
        alignItems: 'center',
        // A client without gradients shows the accent colour instead.
        backgroundColor: BRAND.accent,
        background: {
          type: 'linearGradient',
          angle: '135deg',
          startColor: BRAND.start,
          centerColor: BRAND.center,
          endColor: BRAND.end,
        },
        contents: [logo, title],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: card.body, size: 'md', color: FG, wrap: true },
          { type: 'text', text: card.note, size: 'xs', color: MUTED, wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: card.buttons.map((b) => ({
          type: 'button',
          style: b.style,
          height: 'sm',
          ...(b.style === 'primary' ? { color: BRAND.accent } : {}),
          action: {
            type: 'postback',
            label: b.label.slice(0, LABEL_MAX),
            data: b.data,
            displayText: b.displayText,
          },
        })),
      },
    },
  };
}

export type LineRichMenu = {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: {
    bounds: { x: number; y: number; width: number; height: number };
    action: PostbackAction;
  }[];
};

export function toLineRichMenu(menu: RichMenuSpec): LineRichMenu {
  return {
    size: { width: menu.width, height: menu.height },
    // Shown open at first, so a new friend sees the buttons at once.
    selected: true,
    name: menu.name,
    chatBarText: menu.chatBarText,
    areas: menu.areas.map((a) => ({
      bounds: { x: a.x, y: a.y, width: a.width, height: a.height },
      action: {
        type: 'postback',
        label: a.displayText.slice(0, LABEL_MAX),
        data: a.data,
        displayText: a.displayText,
      },
    })),
  };
}
