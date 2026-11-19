import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { testIds } from '@/common/test-ids';

import { UsageSection } from './UsageSection';

describe('UsageSection server render', () => {
  it('renders no month from the clock, so hydration in another month cannot differ', () => {
    const client = new QueryClient();
    const html = renderToString(
      createElement(QueryClientProvider, { client }, createElement(UsageSection)),
    );
    expect(html).toContain(`data-testid="${testIds.usageMonth}"`);
    // The month trigger carries no value and shows no month label.
    expect(html).not.toContain('data-value=');
    expect(html).not.toMatch(/25[0-9]{2}/);
    // The report waits for the month: the loading skeleton, and no request was started.
    expect(html).toContain('aria-busy="true"');
    const usage = client.getQueryCache().findAll({ queryKey: ['usage'] });
    expect(usage.map((query) => query.state.fetchStatus)).toEqual(['idle']);
  });
});
