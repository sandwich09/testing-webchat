import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertEnv, assertEnvOrExit, InvalidEnvError, parseEnv } from './env';

const SECRET = Buffer.alloc(32, 7).toString('base64');
const KEY = Buffer.alloc(32, 9).toString('base64');

const valid = (): Record<string, string | undefined> => ({
  DATABASE_URL: 'postgresql://u:p@localhost:15432/db',
  ACCESS_CODE: 'open-sesame',
  SESSION_SECRET: SECRET,
  CREDENTIALS_ENCRYPTION_KEY: KEY,
  ANTHROPIC_API_KEY: 'fake-key',
  FILE_STORAGE: 'local',
  APP_BASE_URL: 'http://localhost:3000',
});

const invalidNames = (source: Record<string, string | undefined>): string[] => {
  const r = parseEnv(source);
  return r.ok ? [] : r.invalid;
};

describe('parseEnv', () => {
  it('accepts the required variables and applies the documented defaults', () => {
    const r = parseEnv(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.env).toMatchObject({
      fileStorage: { kind: 'local' },
      appBaseUrl: 'http://localhost:3000',
      appOrigin: 'http://localhost:3000',
      lineApiBaseUrl: 'https://api.line.me',
      lineDataApiBaseUrl: 'https://api-data.line.me',
      anthropicBaseUrl: undefined,
      pollIntervalMs: 2000,
      aiDebounceMs: 2500,
      rateLimitScale: 1,
      isDevelopment: false,
    });
  });

  it('reads the optional variables', () => {
    const r = parseEnv({
      ...valid(),
      LINE_API_BASE_URL: 'http://localhost:4015/line',
      LINE_DATA_API_BASE_URL: 'http://localhost:4015/line-data',
      ANTHROPIC_BASE_URL: 'http://localhost:4015/anthropic',
      POLL_INTERVAL_MS: '500',
      AI_DEBOUNCE_MS: '300',
      RATE_LIMIT_SCALE: '10',
      NODE_ENV: 'development',
    });
    expect(r.ok && r.env).toMatchObject({
      lineApiBaseUrl: 'http://localhost:4015/line',
      lineDataApiBaseUrl: 'http://localhost:4015/line-data',
      anthropicBaseUrl: 'http://localhost:4015/anthropic',
      pollIntervalMs: 500,
      aiDebounceMs: 300,
      rateLimitScale: 10,
      isDevelopment: true,
    });
  });

  it.each([
    'DATABASE_URL',
    'ACCESS_CODE',
    'SESSION_SECRET',
    'CREDENTIALS_ENCRYPTION_KEY',
    'ANTHROPIC_API_KEY',
    'FILE_STORAGE',
    'APP_BASE_URL',
  ])('names %s when it is missing or empty', (name) => {
    expect(invalidNames({ ...valid(), [name]: undefined })).toEqual([name]);
    expect(invalidNames({ ...valid(), [name]: '  ' })).toEqual([name]);
  });

  it.each(['0', '-1', '1.5', '2.0', 'ten', '1e3', ' 3x'])(
    'rejects RATE_LIMIT_SCALE=%s with the variable name',
    (value) => {
      expect(invalidNames({ ...valid(), RATE_LIMIT_SCALE: value })).toEqual(['RATE_LIMIT_SCALE']);
    },
  );

  it('rejects intervals that are not positive integers', () => {
    expect(invalidNames({ ...valid(), POLL_INTERVAL_MS: '0', AI_DEBOUNCE_MS: '2.5' })).toEqual([
      'AI_DEBOUNCE_MS',
      'POLL_INTERVAL_MS',
    ]);
  });

  it('treats an empty optional value as unset', () => {
    const r = parseEnv({ ...valid(), RATE_LIMIT_SCALE: '', BLOB_READ_WRITE_TOKEN: '' });
    expect(r.ok && r.env.rateLimitScale).toBe(1);
  });

  it.each([
    ['too short', Buffer.alloc(16).toString('base64')],
    ['too long', Buffer.alloc(33).toString('base64')],
    ['not base64', '!'.repeat(44)],
    ['stray bits', `${SECRET.slice(0, 42)}B=`],
  ])('rejects a secret that is %s', (_label, value) => {
    expect(
      invalidNames({ ...valid(), SESSION_SECRET: value, CREDENTIALS_ENCRYPTION_KEY: value }),
    ).toEqual(['CREDENTIALS_ENCRYPTION_KEY', 'SESSION_SECRET']);
  });

  it('accepts a base64url secret like the system adapters do', () => {
    const url = Buffer.alloc(32, 250).toString('base64url');
    expect(parseEnv({ ...valid(), SESSION_SECRET: url }).ok).toBe(true);
  });

  it.each(['http://localhost:3000/', 'localhost:3000', 'ftp://host', 'http://h/?a=1', 'nope'])(
    'rejects APP_BASE_URL=%s',
    (value) => {
      expect(invalidNames({ ...valid(), APP_BASE_URL: value })).toEqual(['APP_BASE_URL']);
    },
  );

  it('keeps a path of APP_BASE_URL but compares the origin only', () => {
    const r = parseEnv({ ...valid(), APP_BASE_URL: 'https://shop.example.com/app' });
    expect(r.ok && r.env.appOrigin).toBe('https://shop.example.com');
  });

  it('rejects FILE_STORAGE outside local and blob', () => {
    expect(invalidNames({ ...valid(), FILE_STORAGE: 's3' })).toEqual(['FILE_STORAGE']);
  });

  it('needs BLOB_READ_WRITE_TOKEN only when FILE_STORAGE is blob', () => {
    expect(invalidNames({ ...valid(), FILE_STORAGE: 'blob' })).toEqual(['BLOB_READ_WRITE_TOKEN']);
    const r = parseEnv({ ...valid(), FILE_STORAGE: 'blob', BLOB_READ_WRITE_TOKEN: 'tok' });
    expect(r.ok && r.env.fileStorage).toEqual({ kind: 'blob', token: 'tok' });
  });

  it('rejects a base URL override that is not http(s)', () => {
    expect(invalidNames({ ...valid(), ANTHROPIC_BASE_URL: 'file:///etc' })).toEqual([
      'ANTHROPIC_BASE_URL',
    ]);
  });
});

describe('parseEnv with VERCEL_ENV=production', () => {
  const production = (over: Record<string, string | undefined> = {}) => ({
    ...valid(),
    FILE_STORAGE: 'blob',
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_fake',
    VERCEL_ENV: 'production',
    ...over,
  });

  it('accepts production settings with the official hosts by default', () => {
    const r = parseEnv(production());
    expect(r.ok && r.env).toMatchObject({
      lineApiBaseUrl: 'https://api.line.me',
      lineDataApiBaseUrl: 'https://api-data.line.me',
      anthropicBaseUrl: undefined,
      rateLimitScale: 1,
      fileStorage: { kind: 'blob' },
    });
    expect(parseEnv(production({ RATE_LIMIT_SCALE: '1' })).ok).toBe(true);
  });

  it.each([
    ['LINE_API_BASE_URL', 'http://localhost:4010/line'],
    ['LINE_DATA_API_BASE_URL', 'http://stub:4010/line-data'],
    ['ANTHROPIC_BASE_URL', 'http://stub:4010/anthropic'],
    // Even the official host: the documented design is "unset in production".
    ['LINE_API_BASE_URL', 'https://api.line.me'],
    ['ANTHROPIC_BASE_URL', 'https://api.anthropic.com'],
  ])('refuses %s=%s, naming the variable only', (name, value) => {
    expect(invalidNames(production({ [name]: value }))).toEqual([name]);
  });

  it('refuses FILE_STORAGE=local and RATE_LIMIT_SCALE other than 1', () => {
    expect(invalidNames(production({ FILE_STORAGE: 'local' }))).toEqual(['FILE_STORAGE']);
    expect(invalidNames(production({ RATE_LIMIT_SCALE: '10' }))).toEqual(['RATE_LIMIT_SCALE']);
  });

  it('lists every test-only setting at once', () => {
    expect(
      invalidNames(
        production({
          FILE_STORAGE: 'local',
          LINE_API_BASE_URL: 'http://stub:4010/line',
          LINE_DATA_API_BASE_URL: 'http://stub:4010/line-data',
          ANTHROPIC_BASE_URL: 'http://stub:4010/anthropic',
          RATE_LIMIT_SCALE: '10',
        }),
      ),
    ).toEqual([
      'ANTHROPIC_BASE_URL',
      'FILE_STORAGE',
      'LINE_API_BASE_URL',
      'LINE_DATA_API_BASE_URL',
      'RATE_LIMIT_SCALE',
    ]);
  });

  it.each([undefined, '', 'preview', 'development'])(
    'keeps the stub settings of Docker, CI and previews when VERCEL_ENV is %j',
    (vercelEnv) => {
      const r = parseEnv({
        ...valid(),
        VERCEL_ENV: vercelEnv,
        LINE_API_BASE_URL: 'http://stub:4010/line',
        LINE_DATA_API_BASE_URL: 'http://stub:4010/line-data',
        ANTHROPIC_BASE_URL: 'http://stub:4010/anthropic',
        RATE_LIMIT_SCALE: '10',
      });
      expect(r.ok && r.env).toMatchObject({
        fileStorage: { kind: 'local' },
        lineApiBaseUrl: 'http://stub:4010/line',
        rateLimitScale: 10,
      });
    },
  );
});

describe('assertEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws naming the variable and never its value', () => {
    for (const [k, v] of Object.entries(valid())) vi.stubEnv(k, v);
    vi.stubEnv('RATE_LIMIT_SCALE', '0.5');
    vi.stubEnv('ACCESS_CODE', 'super-secret-code-value');
    vi.stubEnv('SESSION_SECRET', 'short-secret-value');
    let thrown: unknown;
    try {
      assertEnv();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(InvalidEnvError);
    const message = (thrown as Error).message;
    expect(message).toContain('RATE_LIMIT_SCALE');
    expect(message).toContain('SESSION_SECRET');
    expect(message).not.toContain('short-secret-value');
    expect(message).not.toContain('0.5');
  });

  it('fails on Vercel production with a stub base URL, naming it without its value', () => {
    for (const [k, v] of Object.entries(valid())) vi.stubEnv(k, v);
    vi.stubEnv('FILE_STORAGE', 'blob');
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_fake');
    vi.stubEnv('LINE_API_BASE_URL', undefined);
    vi.stubEnv('LINE_DATA_API_BASE_URL', undefined);
    vi.stubEnv('RATE_LIMIT_SCALE', undefined);
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://stub-host-value:4010/anthropic');
    expect(() => {
      assertEnv();
    }).toThrow(new InvalidEnvError(['ANTHROPIC_BASE_URL']));
    try {
      assertEnv();
    } catch (e) {
      expect((e as Error).message).not.toContain('stub-host-value');
    }
  });
});

describe('assertEnvOrExit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes the variable names and exits with 1', () => {
    vi.stubEnv('APP_BASE_URL', '');
    const lines: string[] = [];
    const exit = vi.fn((code: number): never => {
      throw new Error(`exit ${String(code)}`);
    });
    expect(() => {
      assertEnvOrExit(exit, (l) => lines.push(l));
    }).toThrow('exit 1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(lines.join('')).toContain('APP_BASE_URL');
  });
});
