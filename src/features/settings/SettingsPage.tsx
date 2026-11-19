import { Suspense } from 'react';

import { testIds } from '@/common/test-ids';
import { copy } from '@/features/settings/settings.constants';
import { SettingsTabs } from '@/features/settings/SettingsTabs';

/** The settings page: title, then the tabs of ui-screens 9.2 and the cards of the open tab. */
export function SettingsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        data-testid={testIds.settingsPage}
        className="mx-auto min-h-full max-w-[880px] px-4 py-5 medium:px-10 medium:py-8"
      >
        <h1 className="text-title font-bold">{copy.page.title}</h1>
        {/* `useSearchParams` needs a Suspense boundary (next/dist/docs use-search-params). */}
        <Suspense fallback={null}>
          <SettingsTabs />
        </Suspense>
      </div>
    </div>
  );
}
