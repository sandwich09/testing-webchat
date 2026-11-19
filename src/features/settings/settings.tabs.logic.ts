// Pure logic of the settings tabs (docs/specs/ui-screens.md section 9.2).

/** The tabs of the settings page, in the order they are shown. The value is `?tab=` of the URL. */
export const SETTINGS_TABS = ['ai', 'knowledge', 'line', 'usage', 'status'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The tab opened when the URL names none and LINE is connected. */
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'ai';

/** `?tab=` of the URL as a tab, or null when it is missing or names no tab. */
export function parseSettingsTab(param: string | null): SettingsTab | null {
  return SETTINGS_TABS.find((tab) => tab === param) ?? null;
}

/**
 * The tab to show. A tab in the URL wins; an unknown value counts as none. Without one, the LINE
 * tab opens while LINE is not connected yet (the first thing to set up), else the AI tab.
 * `lineConfigured` is undefined while the settings load: the answer is null until then, unless the
 * settings failed to load (`settingsFailed`), which opens the default tab.
 */
export function resolveSettingsTab(input: {
  param: string | null;
  lineConfigured: boolean | undefined;
  settingsFailed: boolean;
}): SettingsTab | null {
  const requested = parseSettingsTab(input.param);
  if (requested !== null) return requested;
  if (input.lineConfigured === undefined) {
    return input.settingsFailed ? DEFAULT_SETTINGS_TAB : null;
  }
  return input.lineConfigured ? DEFAULT_SETTINGS_TAB : 'line';
}

/** The search string of the URL with `tab` set, other parameters kept: "?tab=line". */
export function settingsTabSearch(currentSearch: string, tab: SettingsTab): string {
  const params = new URLSearchParams(currentSearch);
  params.set('tab', tab);
  return `?${params.toString()}`;
}
