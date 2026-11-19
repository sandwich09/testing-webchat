// Unit test of next.config.ts: the proxy body buffer holds the largest local-disk upload. A body
// over `experimental.proxyClientMaxBodySize` reaches the route silently cut to that size.
import { describe, expect, it } from 'vitest';
import { PREVIEW_MAX_BYTES, PROXY_BODY_MAX_BYTES, VIDEO_MAX_BYTES } from '../src/core/domain';
import nextConfig from '../next.config';

describe('next.config.ts', () => {
  it('buffers request bodies up to PROXY_BODY_MAX_BYTES for proxy.ts', () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(PROXY_BODY_MAX_BYTES);
  });

  it('holds a video of VIDEO_MAX_BYTES and its preview with room to spare', () => {
    expect(PROXY_BODY_MAX_BYTES).toBeGreaterThan(VIDEO_MAX_BYTES + PREVIEW_MAX_BYTES);
  });
});
