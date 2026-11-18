import { ArrowDown } from 'lucide-react';

import { testIds } from '@/common/test-ids';
import { copy } from '@/features/inbox/inbox.constants';

/** Floating capsule at the bottom centre of the message area (ui-screens 5.4). */
export function NewMessagesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid={testIds.newMessagesButton}
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-10 inline-flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sub font-bold whitespace-nowrap text-fg shadow-md medium:h-9"
    >
      <ArrowDown aria-hidden="true" className="size-4" />
      {copy.thread.newMessages}
    </button>
  );
}
