import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { TOAST_DURATION_MS, TOAST_ERROR_DURATION_MS } from './common.constants';
import { testIds } from './test-ids';
import { showToast } from './toast';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('showToast', () => {
  it('shows a success toast with the toast test id for the normal time', () => {
    showToast('success', 'saved');
    expect(toast.success).toHaveBeenCalledWith('saved', {
      testId: testIds.toast,
      duration: TOAST_DURATION_MS,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows an error toast with the toast test id for the longer time', () => {
    showToast('error', 'failed');
    expect(toast.error).toHaveBeenCalledWith('failed', {
      testId: testIds.toast,
      duration: TOAST_ERROR_DURATION_MS,
    });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
