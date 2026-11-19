import { WifiOff } from 'lucide-react';

import { copy } from '@/common/common.constants';
import { testIds } from '@/common/test-ids';

/** Strip above the content while polling keeps failing. The caller decides when to render it (ui-screens 3.4). */
export function ConnectionBanner() {
  return (
    <div
      role="status"
      data-testid={testIds.connectionBanner}
      className="flex h-9 shrink-0 items-center justify-center gap-2 bg-[#FFF4E5] px-4 text-sub text-warn"
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{copy.connection.banner}</span>
    </div>
  );
}
