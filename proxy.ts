import type { NextRequest, NextResponse } from 'next/server';
import { proxyGate } from '@/composition';

// Cookie gate, origin check and CSP nonce of docs/architecture/project-setup.md "proxy.ts".
// The logic lives in src/composition (proxy-gate.ts) where it is unit tested.
export function proxy(request: NextRequest): Promise<NextResponse> {
  return proxyGate(request);
}

export const config = {
  // Every path except static assets. Must stay a literal: Next.js reads it at build time.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico$|robots\\.txt$).*)'],
};
