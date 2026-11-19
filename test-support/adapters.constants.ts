// Endpoints of the Docker compose services used by the `adapters` Vitest project
// (docs/architecture/project-setup.md section 6.7). These are test constants, not app env vars.
//
// The two overrides exist so that several people (or agents) can run adapter tests at the same
// time on one machine without truncating each other's tables or resetting each other's stub:
//   ADAPTER_TEST_DATABASE_NAME=webchat_test_alice ADAPTER_TEST_STUB_URL=http://localhost:4011
const databaseName = process.env.ADAPTER_TEST_DATABASE_NAME;
const stubUrl = process.env.ADAPTER_TEST_STUB_URL;

export const ADAPTER_TEST_DATABASE_NAME =
  databaseName !== undefined && /^[a-z0-9_]+$/.test(databaseName) ? databaseName : 'webchat_test';
export const ADAPTER_TEST_ADMIN_DATABASE_URL =
  'postgresql://webchat:webchat@localhost:15432/webchat';
export const ADAPTER_TEST_DATABASE_URL = `postgresql://webchat:webchat@localhost:15432/${ADAPTER_TEST_DATABASE_NAME}`;
export const ADAPTER_TEST_STUB_URL =
  stubUrl !== undefined && stubUrl !== '' ? stubUrl : 'http://localhost:4010';
