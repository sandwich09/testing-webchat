import { toast } from 'sonner';

import { TOAST_DURATION_MS, TOAST_ERROR_DURATION_MS } from '@/common/common.constants';
import { testIds } from '@/common/test-ids';

export type ToastTone = 'success' | 'error';

/**
 * Shows one toast (ui-screens 10). Every toast carries `data-testid="toast"`; sonner sets
 * `data-type` to the tone on the same element, which is what tests read. An error stays longer.
 */
export function showToast(tone: ToastTone, text: string): void {
  switch (tone) {
    case 'success':
      toast.success(text, { testId: testIds.toast, duration: TOAST_DURATION_MS });
      return;
    case 'error':
      toast.error(text, { testId: testIds.toast, duration: TOAST_ERROR_DURATION_MS });
      return;
  }
}
