// Values of the rich menu and of the welcome card in LINE-neutral form (specs/line-messaging.md
// "Rich menu" and "ข้อความต้อนรับ"). The LINE adapter turns them into LINE JSON.

/** The three buttons of the rich menu and of the welcome card, one shared set. */
export const RICH_MENU_ACTIONS = ['ai_on', 'admin', 'how_to'] as const;
export type RichMenuAction = (typeof RICH_MENU_ACTIONS)[number];

/** One tappable area of the rich menu image, in pixels of the image. */
export interface RichMenuArea {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Postback data, from postbackDataOf. */
  data: string;
  /** Shown in the chat as the customer's own message when the button is tapped. */
  displayText: string;
}

export interface RichMenuSpec {
  width: number;
  height: number;
  /** Internal name of the menu at LINE (not shown to customers). */
  name: string;
  /** Text of the bar that opens the menu. */
  chatBarText: string;
  areas: RichMenuArea[];
}

/** The welcome card sent on a follow event (a Flex bubble at LINE). */
export interface WelcomeCard {
  /** Plain text for notifications and clients that cannot show the card. */
  altText: string;
  /** HTTPS URL of the logo picture; null draws a header with text only. */
  logoUrl: string | null;
  /** "ยินดีต้อนรับสู่" */
  titleLine: string;
  /** The LINE OA display name, or the app name. */
  accountName: string;
  body: string;
  note: string;
  buttons: {
    label: string;
    data: string;
    displayText: string;
    style: 'primary' | 'secondary' | 'link';
  }[];
}
