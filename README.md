# Test webchat application

A web inbox for a shop's admins to answer customers who message the shop's LINE Official Account. Customers chat in the LINE app; admins see who wrote, pick a customer and reply from the browser. An optional AI assistant (Claude) can answer per customer from the chat history and a knowledge base built from the shop's PDFs, inside a topic boundary the shop sets.

Built for the Robolingo webchat assignment. The screens are in Thai; the design docs in [`docs/`](docs/README.md) are in Thai with English technical terms and are the source of truth for behaviour.

## Deliverables

| Item | URL |
| --- | --- |
| LINE OA to test with | `TODO (owner): LINE OA add-friend URL` |
| Webchat | `TODO (owner): production URL on Vercel` |
| GitHub repository | `TODO (owner): public repository URL` |

The access code of the production webchat is not in this repository; it is sent to the reviewer separately.

## Assignment requirements

| Requirement | Where it is met | Proof |
| --- | --- | --- |
| R1 Next.js with TypeScript | Next.js 16 App Router, TypeScript `strict` | `pnpm typecheck` |
| R2 Send messages from the webchat to LINE | Reply token first, push as fallback, with a retry key ([line-messaging](docs/specs/line-messaging.md)) | E2E journey 2 against the LINE stub |
| R3 Receive messages sent to the LINE OA | Signed webhook, de-duplicated events ([line-messaging](docs/specs/line-messaging.md)) | E2E journey 1 |
| R4 Public GitHub repository | This repository | Deliverables table |
| R5 Hosted on Vercel | [deploy runbook](docs/runbooks/deploy.md), `vercel.json` | Not deployed yet (see "Verified and not verified") |
| R6 See who wrote and pick who to answer | Contact list with LINE name and picture, one chat per customer ([webchat-inbox](docs/specs/webchat-inbox.md)) | E2E journeys 1 and 2 |

The full requirement list, including the extras below, is in [requirements](docs/product/requirements.md).

## Features

- Access gate: a shared access code, a signed `HttpOnly` cookie, rate-limited attempts ([access-gate](docs/specs/access-gate.md)).
- Inbox: contact list with unread and "needs admin" tabs and search, chat with day chips and grouping, polling instead of WebSockets ([ADR 0005](docs/adr/0005-polling-instead-of-realtime.md)).
- Messages in both directions: text, images and video; stickers and other types are shown as labels. Images (JPEG, PNG, WebP, HEIC) are converted and get a preview in the browser before upload.
- Delivery state (sending, sent, failed) with retry under the same LINE retry key; canned replies; LINE's typing indicator while the admin types.
- AI reply per customer: Claude answers from the chat history and the knowledge base, hands over to an admin when it cannot answer, and turns itself off when an admin replies ([ai-reply](docs/specs/ai-reply.md), [ai-prompt](docs/specs/ai-prompt.md)).
- Admin back office: LINE credentials (encrypted at rest), global AI kill switch, model choice, daily budget, PDF knowledge base, canned replies, token and cost report per customer, system status ([admin-backoffice](docs/specs/admin-backoffice.md), [usage-cost](docs/specs/usage-cost.md)).
- Guardrail showcase: a topic boundary checked by a separate, cheaper model call before the reply model sees the message; out-of-topic messages get the shop's refusal text and never reach the reply model ([topic-guard](docs/specs/topic-guard.md), [ADR 0020](docs/adr/0020-topic-guardrail-as-separate-check.md)). A Guardrails panel in the settings page counts today's checks per layer (input, output, action, human, control), and [ai-guardrails](docs/security/ai-guardrails.md) maps each common guardrail practice to the code and the test that covers it. A manual evaluation script (`pnpm ai:eval`) computes attack success, false-positive, task success and unauthorized-action rates; it calls the real API and only runs when the owner asks.

## Architecture

```
LINE Platform ──webhook──▶ ┌──────────── Next.js app (one deployment) ────────────┐
              ◀─reply/push─ │ app/ routes and pages                                │
                            │   └─▶ src/core/use-cases ─▶ src/core/domain          │
Admin browser ──HTTP/poll─▶ │ src/adapters (LINE, Claude, Prisma, Blob, disk) ─▶   │
                            │   src/core/ports        src/composition wires them   │
                            └──────────┬──────────────┬───────────────┬───────────┘
                                   Postgres      Vercel Blob or      Claude API
                                                 local disk
```

A hexagonal core (`src/core/`) knows only its ports; adapters implement them and `src/composition/` is the only place that builds real adapters. Lint enforces the import direction. Every external service has a fake for unit tests and an HTTP stub (`stubs/server.ts`) for adapter and E2E tests. Start with [architecture overview](docs/architecture/overview.md), then [backend](docs/architecture/backend.md), [frontend](docs/architecture/frontend.md), [data model](docs/architecture/data-model.md) and the [ADRs](docs/adr/).

## Run it in one command

Requirements: Docker with Compose v2. No real LINE or Anthropic credentials are needed.

```bash
docker compose up --build
```

Then open http://localhost:3000. The access code is the `ACCESS_CODE` value of the `app` service in [`docker-compose.yml`](docker-compose.yml) (a local-only value).

What starts:

| Service | Port on the host | Role |
| --- | --- | --- |
| `app` | 3000 | The built app (Next.js standalone); runs migrations at start |
| `db` | 15432 | PostgreSQL 17 |
| `stub` | 4010 | Stands in for the LINE Messaging API and the Claude API (records requests, returns canned answers) |
| `seed` | | Loads sample contacts, messages, a knowledge-base document and canned replies once the app is healthy, then exits; safe to run again with `docker compose run --rm seed` |

Behind a proxy that re-signs HTTPS, pass its CA to the image build: `EXTRA_CA_FILE=/path/to/ca.pem docker compose up --build` ([project-setup 7.1](docs/architecture/project-setup.md#71-dockerfile)).

### Send a fake LINE message

The seed connects the app to the stub with the channel secret `stub-channel-secret` (`e2e/fixtures/line/credentials.ts`). A webhook signed with that secret behaves like a real customer message. With `curl` and `openssl`:

```bash
USER_ID="U$(openssl rand -hex 16)"
# Optional: the name the stub returns for this LINE user (otherwise a generated one).
curl -s -X POST http://localhost:4010/__control/line/profiles \
  -H 'content-type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"displayName\":\"Demo customer\"}"

BODY=$(printf '{"destination":"Ustub00000000000000000000000000000","events":[{"type":"message","mode":"active","timestamp":%s,"source":{"type":"user","userId":"%s"},"webhookEventId":"%s","deliveryContext":{"isRedelivery":false},"replyToken":"%s","message":{"id":"%s","type":"text","quoteToken":"demo","text":"Hello, what time do you open?"}}]}' \
  "$(date +%s)000" "$USER_ID" "DEMO$(openssl rand -hex 11)" "$(openssl rand -hex 16)" "$(date +%s%N | cut -c1-18)")
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac stub-channel-secret -binary | base64)

curl -s -X POST http://localhost:3000/api/line/webhook \
  -H 'content-type: application/json' -H "x-line-signature: $SIG" --data-binary "$BODY"
```

The customer shows up at the top of the chat list within a second. Replies from the webchat go to the stub; `GET http://localhost:4010/__control/line/requests` lists what "LINE" received. Other event types (image, sticker, follow, unfollow) are in `e2e/fixtures/line/`, and `e2e/helpers/line-webhook.ts` fills and signs them for the tests. Stub routes are documented in [stubs-and-fixtures](docs/qa/stubs-and-fixtures.md).

## Tests

Install once with `pnpm install` (Node 24, pnpm version from `packageManager`).

| Suite | Command | Needs |
| --- | --- | --- |
| Format, lint, types | `pnpm format:check && pnpm lint && pnpm typecheck` | nothing |
| Unit (core, use cases with fakes, screen logic) with coverage | `pnpm test:coverage` (90% gate on `src/core/**`) | nothing |
| Adapters against Postgres and the stub | `docker compose up -d --wait db stub` then `pnpm test:adapters` | Docker |
| E2E, 9 journeys at 1280 px and 390 px | `docker compose up -d --build --wait db stub app`, `docker compose run --rm seed`, then `pnpm exec playwright install chromium` (first time) and `pnpm test:e2e` | Docker |
| Production build | `pnpm build` | nothing |

E2E checks accessibility with axe on the welcome, chat and settings pages and fails on any console error or CSP violation. The strategy is in [test-strategy](docs/qa/test-strategy.md); the manual script for real LINE and Claude is [manual-test-script](docs/qa/manual-test-script.md).

## Deploy to Vercel and connect a real LINE OA

Follow [deploy](docs/runbooks/deploy.md) (Neon, Vercel, Blob store, Deploy Hook, CI on `main`) and then [line-oa-setup](docs/runbooks/line-oa-setup.md). Day-to-day operation is in [operations](docs/runbooks/operations.md).

Production environment variables (names only; meanings in [infrastructure](docs/architecture/infrastructure.md)):

`DATABASE_URL`, `DIRECT_URL`, `ACCESS_CODE`, `SESSION_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `FILE_STORAGE` (`blob`), `BLOB_READ_WRITE_TOKEN`, `APP_BASE_URL`. Optional: `POLL_INTERVAL_MS`, `AI_DEBOUNCE_MS`. Never set in production: `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL`, `ANTHROPIC_BASE_URL`, `RATE_LIMIT_SCALE`.

The LINE channel secret and access token are not environment variables: they are entered in the settings page and stored encrypted.

## Verified and not verified

Verified locally with the stubs (Chromium only):

- Lint, typecheck, unit tests with the core coverage gate, adapter tests against Postgres 17 and the stub, production build.
- All 9 E2E journeys at 1280 px and 390 px, including HEIC conversion in the browser under the app's CSP and axe with no violations.
- Layout of the chat page, info panel and settings at 390, 720, 768, 900, 1039 and 1280 px.

Not verified (needs real credentials or accounts):

- Real LINE: reply token lifetime, retry key behaviour, loading indicator, profiles, stickers and media URLs ([work-breakdown 5.2](docs/plans/work-breakdown.md#52-ตรวจไม่ได้หากไม่มี-credential-จริง-เจ้าของงานทำ)).
- Real Claude: answer quality, real cost, prompt caching, model fallback, PDF extraction, topic-guard accuracy and latency; the evaluation script has never run against the API.
- Vercel Blob uploads and public URLs; deployment on Vercel (function limits, region, Deploy Hook, CSP in production). The CI workflow has not run on GitHub yet.
- Firefox and Safari; HEIC photos from a real iPhone (the test file is synthetic).
- `docker compose up` on a machine with no existing images and volumes (checked only on a machine that already had them).

Known limits: one shop and one LINE OA, one shared access code without user accounts, polling rather than push updates, the AI does not read images, and the knowledge base is passed in the prompt rather than searched with embeddings ([ADR 0008](docs/adr/0008-knowledge-base-without-embeddings.md)). The open questions about external services are listed in the [implementation plan](docs/plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง).

## License

[MIT](LICENSE)
