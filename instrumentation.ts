// Fails the server at start when an environment variable is missing or invalid, naming it
// (docs/architecture/project-setup.md sections 4 and 6.10). Skipped during `next build`, which
// runs without the runtime variables, and in the Edge runtime, which this app does not use.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { assertEnvOrExit } = await import('@/composition');
  assertEnvOrExit();
}
