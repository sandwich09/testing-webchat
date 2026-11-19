import 'server-only';

import { z } from 'zod';

// The one module that reads process.env (docs/architecture/project-setup.md section 6.10).
// Error messages name the variable and never echo its value.

const SECRET_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const DEFAULT_LINE_API_BASE_URL = 'https://api.line.me';
const DEFAULT_LINE_DATA_API_BASE_URL = 'https://api-data.line.me';
const DEFAULT_POLL_INTERVAL_MS = 2000;
export const DEFAULT_AI_DEBOUNCE_MS = 2500;
/** The highest AI_DEBOUNCE_MS the timing budget (project-setup 10.4) is proven for. */
export const AI_DEBOUNCE_MAX_MS = 5000;
const DEFAULT_RATE_LIMIT_SCALE = 1;

/** Base URLs that only point at the stub: production uses the official hosts, so they stay unset. */
const PRODUCTION_UNSET = [
  'LINE_API_BASE_URL',
  'LINE_DATA_API_BASE_URL',
  'ANTHROPIC_BASE_URL',
] as const;

/** An empty value counts as unset, as `.env.example` leaves optional values empty. */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const required = z.preprocess(blankToUndefined, z.string());
const optional = z.preprocess(blankToUndefined, z.string().optional());

/** Same acceptance as the system adapters: base64 or base64url that decodes to exactly 32 bytes. */
const isBase64Of32Bytes = (value: string): boolean => {
  if (!BASE64.test(value)) return false;
  const bytes = Buffer.from(value, 'base64');
  const canonical = value.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return bytes.length === SECRET_BYTES && bytes.toString('base64url') === canonical;
};

const secret32 = required.refine(isBase64Of32Bytes);

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * APP_BASE_URL: an absolute http(s) URL with nothing after the host but an optional single `/`
 * (no path, query, fragment or credentials). Surrounding spaces are trimmed, and the value is
 * normalised to its origin: lower-case host, no trailing slash, no default port.
 */
const appBaseUrl = z
  .preprocess(
    (value) => (typeof value === 'string' ? blankToUndefined(value.trim()) : value),
    z.string(),
  )
  .refine((value) => {
    if (!isHttpUrl(value) || /[?#]/.test(value)) return false;
    const url = new URL(value);
    return url.pathname === '/' && url.username === '' && url.password === '';
  })
  .transform((value) => new URL(value).origin);

const optionalUrl = optional.refine((value) => value === undefined || isHttpUrl(value));

const integerAtLeast = (min: number, fallback: number, max = Number.MAX_SAFE_INTEGER) =>
  optional
    .refine(
      (value) =>
        value === undefined ||
        (/^\d{1,9}$/.test(value) && Number(value) >= min && Number(value) <= max),
    )
    .transform((value) => (value === undefined ? fallback : Number(value)));

/**
 * ACCESS_CODE: surrounding spaces are trimmed, as the unlock form's input is trimmed
 * (unlockBodySchema), so a value pasted with a trailing space or newline still matches.
 */
const accessCode = z.preprocess(
  (value) => (typeof value === 'string' ? blankToUndefined(value.trim()) : value),
  z.string(),
);

const envSchema = z
  .object({
    DATABASE_URL: required,
    ACCESS_CODE: accessCode,
    SESSION_SECRET: secret32,
    CREDENTIALS_ENCRYPTION_KEY: secret32,
    ANTHROPIC_API_KEY: required,
    FILE_STORAGE: z.preprocess(blankToUndefined, z.enum(['local', 'blob'])),
    BLOB_READ_WRITE_TOKEN: optional,
    APP_BASE_URL: appBaseUrl,
    LINE_API_BASE_URL: optionalUrl,
    LINE_DATA_API_BASE_URL: optionalUrl,
    ANTHROPIC_BASE_URL: optionalUrl,
    POLL_INTERVAL_MS: integerAtLeast(1, DEFAULT_POLL_INTERVAL_MS),
    AI_DEBOUNCE_MS: integerAtLeast(1, DEFAULT_AI_DEBOUNCE_MS, AI_DEBOUNCE_MAX_MS),
    RATE_LIMIT_SCALE: integerAtLeast(1, DEFAULT_RATE_LIMIT_SCALE),
    NODE_ENV: optional,
    // Set by Vercel (production, preview, development); unset in Docker, CI and `pnpm dev`.
    VERCEL_ENV: optional,
  })
  .superRefine((env, issue) => {
    if (env.FILE_STORAGE === 'blob' && env.BLOB_READ_WRITE_TOKEN === undefined) {
      issue.addIssue({ code: 'custom', path: ['BLOB_READ_WRITE_TOKEN'], message: 'required' });
    }
    if (env.VERCEL_ENV !== 'production') return;
    // Production refuses the settings that exist for stubs and tests (project-setup 6.10).
    for (const name of PRODUCTION_UNSET) {
      if (env[name] !== undefined) {
        issue.addIssue({ code: 'custom', path: [name], message: 'must be unset in production' });
      }
    }
    if (env.FILE_STORAGE === 'local') {
      issue.addIssue({ code: 'custom', path: ['FILE_STORAGE'], message: 'must be blob' });
    }
    if (env.RATE_LIMIT_SCALE !== DEFAULT_RATE_LIMIT_SCALE) {
      issue.addIssue({ code: 'custom', path: ['RATE_LIMIT_SCALE'], message: 'must be 1' });
    }
  });

/** Validated configuration of the app. Holds secrets: never log or return it. */
export interface AppEnv {
  databaseUrl: string;
  accessCode: string;
  sessionSecret: string;
  credentialsEncryptionKey: string;
  anthropicApiKey: string;
  /** Undefined means the SDK default (the public API). */
  anthropicBaseUrl: string | undefined;
  fileStorage: { kind: 'local' } | { kind: 'blob'; token: string };
  /** APP_BASE_URL normalised to its origin (no trailing slash). */
  appBaseUrl: string;
  /** Origin of APP_BASE_URL; with the request's own origin, the origins non-GET requests may have. */
  appOrigin: string;
  lineApiBaseUrl: string;
  lineDataApiBaseUrl: string;
  pollIntervalMs: number;
  aiDebounceMs: number;
  rateLimitScale: number;
  /** `next dev`: the CSP then allows 'unsafe-eval' for React's dev tooling. */
  isDevelopment: boolean;
}

export type ParseEnvResult = { ok: true; env: AppEnv } | { ok: false; invalid: string[] };

/** Validates a set of variables. `invalid` lists variable names only, never values. */
export const parseEnv = (source: Record<string, string | undefined>): ParseEnvResult => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => String(i.path[0] ?? 'environment'));
    return { ok: false, invalid: [...new Set(names)].sort() };
  }
  const e = parsed.data;
  return {
    ok: true,
    env: {
      databaseUrl: e.DATABASE_URL,
      accessCode: e.ACCESS_CODE,
      sessionSecret: e.SESSION_SECRET,
      credentialsEncryptionKey: e.CREDENTIALS_ENCRYPTION_KEY,
      anthropicApiKey: e.ANTHROPIC_API_KEY,
      anthropicBaseUrl: e.ANTHROPIC_BASE_URL,
      fileStorage:
        e.FILE_STORAGE === 'blob'
          ? // superRefine above guarantees the token when FILE_STORAGE is blob.
            { kind: 'blob', token: e.BLOB_READ_WRITE_TOKEN ?? '' }
          : { kind: 'local' },
      appBaseUrl: e.APP_BASE_URL,
      appOrigin: e.APP_BASE_URL,
      lineApiBaseUrl: e.LINE_API_BASE_URL ?? DEFAULT_LINE_API_BASE_URL,
      lineDataApiBaseUrl: e.LINE_DATA_API_BASE_URL ?? DEFAULT_LINE_DATA_API_BASE_URL,
      pollIntervalMs: e.POLL_INTERVAL_MS,
      aiDebounceMs: e.AI_DEBOUNCE_MS,
      rateLimitScale: e.RATE_LIMIT_SCALE,
      isDevelopment: e.NODE_ENV === 'development',
    },
  };
};

/** Error thrown when the environment is invalid. The message names the variables only. */
export class InvalidEnvError extends Error {
  readonly invalid: readonly string[];

  constructor(invalid: readonly string[]) {
    super(`Missing or invalid environment variables: ${invalid.join(', ')}`);
    this.name = 'InvalidEnvError';
    this.invalid = invalid;
  }
}

let cached: AppEnv | null = null;

/** The validated environment of this process. Throws InvalidEnvError on the first bad read. */
export const getEnv = (): AppEnv => {
  if (cached !== null) return cached;
  const result = parseEnv(process.env);
  if (!result.ok) throw new InvalidEnvError(result.invalid);
  cached = result.env;
  return cached;
};

/** Throws InvalidEnvError naming every missing or invalid variable. */
export const assertEnv = (): void => {
  getEnv();
};

/**
 * Called by instrumentation.ts at server start. Next.js only logs an error thrown from
 * `register()` and keeps serving 500s, so the process is ended here, with the variable names
 * (never their values) on stderr.
 */
export const assertEnvOrExit = (
  exit: (code: number) => never = (code) => process.exit(code),
  write: (line: string) => void = (line) => {
    process.stderr.write(line);
  },
): void => {
  try {
    assertEnv();
  } catch (e) {
    write(`${e instanceof InvalidEnvError ? e.message : 'Invalid environment'}\n`);
    exit(1);
  }
};
