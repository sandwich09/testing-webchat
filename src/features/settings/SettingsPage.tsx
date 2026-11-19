import { testIds } from '@/common/test-ids';
import { AiSettingsSection } from '@/features/settings/AiSettingsSection';
import { GuardSection } from '@/features/settings/GuardSection';
import { KnowledgeSection } from '@/features/settings/KnowledgeSection';
import { LineSettingsSection } from '@/features/settings/LineSettingsSection';
import { RichMenuSection } from '@/features/settings/RichMenuSection';
import { copy } from '@/features/settings/settings.constants';
import { SystemStatusSection } from '@/features/settings/SystemStatusSection';
import { UsageSection } from '@/features/settings/UsageSection';

/** The settings page: one column, sections in the order of ui-screens 9. */
export function SettingsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        data-testid={testIds.settingsPage}
        className="mx-auto min-h-full max-w-[760px] bg-surface px-4 py-5 medium:px-10 medium:py-8"
      >
        <h1 className="text-title font-bold">{copy.page.title}</h1>
        <AiSettingsSection />
        <GuardSection />
        <LineSettingsSection />
        <RichMenuSection />
        <KnowledgeSection />
        <UsageSection />
        <SystemStatusSection />
      </div>
    </div>
  );
}
