import { MessagesSquare } from 'lucide-react';

import { testIds } from '@/common/test-ids';
import { copy } from '@/features/inbox/inbox.constants';

/** Shown in the thread column while no chat is selected (ui-screens 5.6). */
export function ThreadPlaceholder() {
  return (
    <div
      data-testid={testIds.threadPlaceholder}
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-muted"
    >
      <MessagesSquare aria-hidden="true" className="size-10" />
      <p className="text-body">{copy.thread.placeholder}</p>
    </div>
  );
}
