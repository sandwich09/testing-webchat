import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  parseSettingsTab,
  resolveSettingsTab,
  settingsTabSearch,
} from './settings.tabs.logic';

describe('parseSettingsTab', () => {
  it('reads the five tabs in their order', () => {
    expect(SETTINGS_TABS).toEqual(['ai', 'knowledge', 'line', 'usage', 'status']);
    for (const tab of SETTINGS_TABS) expect(parseSettingsTab(tab)).toBe(tab);
  });

  it('gives null for a missing or unknown value', () => {
    for (const param of [null, '', 'AI', 'line ', 'guard', '1']) {
      expect(parseSettingsTab(param), String(param)).toBeNull();
    }
  });
});

describe('resolveSettingsTab', () => {
  it('opens the tab of the URL whatever the LINE state', () => {
    for (const lineConfigured of [true, false, undefined]) {
      expect(resolveSettingsTab({ param: 'usage', lineConfigured, settingsFailed: false })).toBe(
        'usage',
      );
    }
  });

  it('opens AI by default once LINE is connected, and LINE while it is not', () => {
    expect(DEFAULT_SETTINGS_TAB).toBe('ai');
    expect(resolveSettingsTab({ param: null, lineConfigured: true, settingsFailed: false })).toBe(
      'ai',
    );
    expect(resolveSettingsTab({ param: null, lineConfigured: false, settingsFailed: false })).toBe(
      'line',
    );
  });

  it('treats an unknown value like none', () => {
    expect(resolveSettingsTab({ param: 'nope', lineConfigured: true, settingsFailed: false })).toBe(
      'ai',
    );
    expect(
      resolveSettingsTab({ param: 'nope', lineConfigured: false, settingsFailed: false }),
    ).toBe('line');
  });

  it('waits for the settings when no tab is named, and opens AI when they failed', () => {
    expect(
      resolveSettingsTab({ param: null, lineConfigured: undefined, settingsFailed: false }),
    ).toBeNull();
    expect(
      resolveSettingsTab({ param: null, lineConfigured: undefined, settingsFailed: true }),
    ).toBe('ai');
  });
});

describe('settingsTabSearch', () => {
  it('sets tab and keeps the other parameters', () => {
    expect(settingsTabSearch('', 'line')).toBe('?tab=line');
    expect(settingsTabSearch('?tab=ai', 'status')).toBe('?tab=status');
    expect(settingsTabSearch('?x=1&tab=ai', 'usage')).toBe('?x=1&tab=usage');
  });
});
