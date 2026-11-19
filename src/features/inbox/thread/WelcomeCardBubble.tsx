import { Sparkles } from 'lucide-react';

import type { CSSProperties } from 'react';

import { formatMessageTime } from '@/common/common.logic';
import {
  BUBBLE_MAX_WIDTH,
  BUBBLE_MAX_WIDTH_NARROW,
  BUBBLE_RADIUS,
  BUBBLE_TAIL_RADIUS,
} from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import { RICH_MENU_ACTIONS, RICH_MENU_LABELS } from '@/contracts';
import { copy } from '@/features/inbox/inbox.constants';
import type { ThreadMessage } from '@/features/inbox/inbox.logic';

const STYLE = {
  '--bubble-wide': BUBBLE_MAX_WIDTH,
  '--bubble-narrow': BUBBLE_MAX_WIDTH_NARROW,
  borderRadius: BUBBLE_RADIUS,
  borderBottomRightRadius: BUBBLE_TAIL_RADIUS,
} as CSSProperties; // CSS custom properties are not part of CSSProperties

const BUTTON_TITLES = RICH_MENU_ACTIONS.map((action) => RICH_MENU_LABELS[action].title);

/**
 * The welcome card in the thread (ui-screens 5.3): a compact bubble on the store side with the
 * card's text and its three buttons as plain chips. The chips are a picture of the card, not
 * controls; the customer taps them in LINE.
 */
export function WelcomeCardBubble({ message }: { message: ThreadMessage }) {
  return (
    <div className="mb-3.5 flex flex-col items-end gap-0.5">
      <div className="flex w-full flex-row-reverse items-end gap-1.5">
        <article
          data-testid={testIds.welcomeBubble}
          data-message-id={message.id}
          aria-label={copy.welcome.label}
          className="max-w-(--bubble-narrow) min-w-0 overflow-hidden border border-line bg-surface medium:max-w-(--bubble-wide)"
          style={STYLE}
        >
          <p className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-meta font-bold text-accent-strong">
            <Sparkles aria-hidden="true" className="size-3.5" />
            {copy.welcome.label}
          </p>
          <p className="px-3 pt-2 text-body [overflow-wrap:anywhere] whitespace-pre-wrap">
            {message.text}
          </p>
          <ul
            aria-label={copy.welcome.buttonsLabel.replace('{buttons}', BUTTON_TITLES.join(', '))}
            className="flex flex-wrap gap-1.5 px-3 pt-2 pb-3"
          >
            {BUTTON_TITLES.map((title) => (
              <li
                key={title}
                aria-hidden="true"
                className="rounded-full border border-line bg-chat px-2.5 py-1 text-meta text-muted"
              >
                {title}
              </li>
            ))}
          </ul>
        </article>
        <div className="flex shrink-0 flex-col items-end text-right text-meta text-muted">
          <span className="font-bold">{copy.welcome.sender}</span>
          <time data-testid={testIds.messageTime} dateTime={message.createdAt}>
            {formatMessageTime(message.createdAt)}
          </time>
        </div>
      </div>
    </div>
  );
}
