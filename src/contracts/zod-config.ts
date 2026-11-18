// Zod's object schemas probe `new Function` once when they are built, to enable a JIT fast path.
// Under the app's CSP (no 'unsafe-eval') the browser blocks the probe and reports a
// `securitypolicyviolation` even though Zod swallows the error. `jitless` skips the probe. It must
// run before any schema is built, so `index.ts` imports this file first.
import { config } from 'zod';

config({ jitless: true });
