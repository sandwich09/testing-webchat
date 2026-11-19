'use client';

// The tabs of the settings page (ui-screens 9.2). The open tab lives in `?tab=` of the URL, so it
// survives a reload and the back and forward buttons move between tabs. Only the open tab's panel
// is mounted, so only its queries load and poll.
import { useSearchParams } from 'next/navigation';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { useSettings } from '@/common/common.hooks';
import { cn, nextTabIndex } from '@/common/common.logic';
import { testIds } from '@/common/test-ids';
import { Skeleton } from '@/common/ui/skeleton';
import { copy as commonCopy } from '@/common/common.constants';

import { AiPersonaSection, AiSettingsSection } from './AiSettingsSection';
import { GuardSection } from './GuardSection';
import { KnowledgeSection } from './KnowledgeSection';
import { LineSettingsSection } from './LineSettingsSection';
import { RichMenuSection, WelcomeSection } from './RichMenuSection';
import { copy } from './settings.constants';
import {
  SETTINGS_TABS,
  resolveSettingsTab,
  settingsTabSearch,
  type SettingsTab,
} from './settings.tabs.logic';
import { SystemStatusSection } from './SystemStatusSection';
import { UsageSection } from './UsageSection';

const TAB_ID = (tab: SettingsTab) => `settings-tab-${tab}`;
const PANEL_ID = 'settings-tab-panel';

function TabPanel({ tab }: { tab: SettingsTab }): ReactNode {
  switch (tab) {
    case 'ai':
      return (
        <>
          <AiSettingsSection />
          <AiPersonaSection />
        </>
      );
    case 'knowledge':
      return (
        <>
          <KnowledgeSection />
          <GuardSection />
        </>
      );
    case 'line':
      return (
        <>
          <LineSettingsSection />
          <RichMenuSection />
          <WelcomeSection />
        </>
      );
    case 'usage':
      return <UsageSection />;
    case 'status':
      return <SystemStatusSection />;
  }
}

function PanelSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only" role="status">
        {commonCopy.loading}
      </span>
      <Skeleton className="h-48 w-full rounded-[18px]" />
      <Skeleton className="h-40 w-full rounded-[18px]" />
    </div>
  );
}

/** Tablist of the five settings tabs and the panel of the open one. */
export function SettingsTabs() {
  const params = useSearchParams();
  const settings = useSettings();
  const refs = useRef<Partial<Record<SettingsTab, HTMLButtonElement | null>>>({});
  const open = resolveSettingsTab({
    param: params.get('tab'),
    lineConfigured: settings.data?.line.configured,
    settingsFailed: settings.isError,
  });

  const select = (tab: SettingsTab) => {
    if (tab === open) return;
    // Next.js folds pushState into its router, so `useSearchParams` sees the new tab
    // (node_modules/next/dist/docs: linking-and-navigating, "Native History API").
    window.history.pushState(null, '', settingsTabSearch(window.location.search, tab));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(event.key, index, SETTINGS_TABS.length);
    const target = next === null ? undefined : SETTINGS_TABS[next];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
    refs.current[target]?.focus();
  };

  return (
    <>
      {/* The strip scrolls sideways on its own on a narrow screen; the page never does. */}
      <div className="-mx-4 mt-3 [scrollbar-width:none] overflow-x-auto px-4 medium:mx-0 medium:px-0">
        <div
          role="tablist"
          aria-label={copy.tabs.label}
          data-testid={testIds.settingsTabs}
          className="flex w-max min-w-full border-b border-line"
        >
          {SETTINGS_TABS.map((tab, index) => {
            const selected = tab === open;
            // Until the tab is known (no `?tab=` and the settings still loading) the first tab
            // is the one in the tab order.
            const tabbable = open === null ? index === 0 : selected;
            return (
              <button
                key={tab}
                ref={(node) => {
                  refs.current[tab] = node;
                }}
                type="button"
                role="tab"
                id={TAB_ID(tab)}
                aria-selected={selected}
                aria-controls={PANEL_ID}
                tabIndex={tabbable ? 0 : -1}
                data-testid={testIds.settingsTab}
                data-tab={tab}
                onClick={() => {
                  select(tab);
                }}
                onKeyDown={(event) => {
                  onKeyDown(event, index);
                }}
                className={cn(
                  'relative flex min-h-11 shrink-0 items-center px-3 py-2 text-body whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-strong medium:px-4',
                  selected ? 'font-bold text-accent-strong' : 'text-muted hover:text-fg',
                )}
              >
                {copy.tabs[tab]}
                {selected ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-strong"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={open === null ? undefined : TAB_ID(open)}
        data-testid={testIds.settingsTabPanel}
        data-tab={open ?? undefined}
        // The panel holds its own focusable controls, so it is not a tab stop itself.
        className="mt-5 flex flex-col gap-4"
      >
        {open === null ? <PanelSkeleton /> : <TabPanel key={open} tab={open} />}
      </div>
    </>
  );
}
