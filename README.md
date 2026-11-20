# Test webchat application

A web inbox for the admins of a LINE Official Account, built as a neutral tool for trying out a LINE OA for free. People chat in the LINE app; admins see who wrote, pick a chat and reply from the browser. An optional AI assistant (Claude) can answer per chat from the chat history and a knowledge base built from uploaded PDFs, with a name, an answer scope and instructions the admins set, inside an optional topic boundary.

Built for the Robolingo webchat assignment. The screens are in Thai; the design docs in [`docs/`](docs/README.md) are in Thai with English technical terms and are the source of truth for behaviour.

## Deliverables

| Item | URL |
| --- | --- |
| LINE OA to test with | https://lin.ee/TcT6CYw |
| Webchat | https://testing-webchat-nu.vercel.app/ |
| GitHub repository | https://github.com/sandwich09/testing-webchat |
| Report site (walkthrough, architecture, test results) | https://sandwich09.github.io/testing-webchat/ |

The access code of the production webchat is not in this repository; it is sent to the reviewer separately.

## Assignment requirements

| Requirement | Where it is met | Proof |
| --- | --- | --- |
| R1 Next.js with TypeScript | Next.js 16 App Router, TypeScript `strict` | `pnpm typecheck` |
| R2 Send messages from the webchat to LINE | Reply token first, push as fallback, with a retry key ([line-messaging](docs/specs/line-messaging.md)) | E2E journey 2 against the LINE stub |
| R3 Receive messages sent to the LINE OA | Signed webhook, de-duplicated events ([line-messaging](docs/specs/line-messaging.md)) | E2E journey 1 |
| R4 Public GitHub repository | This repository | Deliverables table |
| R5 Hosted on Vercel | [deploy runbook](docs/runbooks/deploy.md), `vercel.json` | First production test done; what it confirmed is listed in "Verified and not verified" |
| R6 See who wrote and pick who to answer | Contact list with LINE name and picture, one chat per customer ([webchat-inbox](docs/specs/webchat-inbox.md)) | E2E journeys 1 and 2 |

The full requirement list, including the extras below, is in [requirements](docs/product/requirements.md).

## Features

- Access gate: a shared access code, a signed `HttpOnly` cookie, rate-limited attempts; every request that changes data must come from the same origin or `APP_BASE_URL` ([access-gate](docs/specs/access-gate.md), [ADR 0025](docs/adr/0025-same-origin-or-app-base-url.md)).
- Inbox: contact list ordered by each customer's latest message, loaded page by page as it scrolls, with unread and "needs admin" tabs and search, chat with day chips and grouping, polling instead of WebSockets with back-off counted per query ([webchat-inbox](docs/specs/webchat-inbox.md), [ADR 0005](docs/adr/0005-polling-instead-of-realtime.md), [ADR 0028](docs/adr/0028-review-fixes-concurrency-polling-and-ci.md)).
- Messages in both directions: text, images and video; inbound voice messages are stored and play in the chat; stickers and other types are shown as labels. A LINE reply that quotes an earlier message shows the quoted block. Images (JPEG, PNG, WebP, HEIC) are converted and get a preview in the browser before upload; a failed upload or media download shows its reason ([line-messaging](docs/specs/line-messaging.md)).
- Delivery state (sending, sent, failed) with retry under the same LINE retry key; LINE's typing indicator while the admin types.
- Admin notes per customer in the info panel; they stay in the webchat and are never sent to LINE or to the AI ([webchat-inbox](docs/specs/webchat-inbox.md#โน้ตของแอดมิน)).
- AI reply per customer: Claude (default model `claude-sonnet-5-5`) answers from the chat history and the knowledge base, hands over to an admin when it cannot answer, and turns itself off for that customer when an admin replies. A neutral core prompt is combined with the admins' settings: AI name, answer scope (`general` or `knowledge_only`), polite particle and custom instructions ([ai-reply](docs/specs/ai-reply.md), [ai-prompt](docs/specs/ai-prompt.md), [ADR 0026](docs/adr/0026-neutral-core-prompt-and-layered-settings.md)).
- LINE rich menu (three buttons in one row: talk to the AI, talk to an admin, how to test) published from the settings page and answered with postbacks, and a Flex welcome card sent when someone adds the OA as a friend; the how-to and welcome texts are editable ([line-messaging](docs/specs/line-messaging.md#rich-menu), [ADR 0027](docs/adr/0027-rich-menu-and-welcome-card.md)).
- Admin back office: LINE credentials (encrypted at rest, checked to belong to one channel), global AI kill switch, AI settings, daily budget, PDF knowledge base, rich menu and welcome card, token and cost report per customer, system status ([admin-backoffice](docs/specs/admin-backoffice.md), [usage-cost](docs/specs/usage-cost.md)).
- App icon and LINE OA profile picture rendered from checked-in sources ([frontend](docs/architecture/frontend.md#brand-assets)).
- Guardrail showcase: a topic boundary checked by a separate, cheaper model call before the reply model sees the message; out-of-topic messages get a fixed refusal (its polite ending follows the chosen particle) and never reach the reply model ([topic-guard](docs/specs/topic-guard.md), [ADR 0020](docs/adr/0020-topic-guardrail-as-separate-check.md), [ADR 0024](docs/adr/0024-scope-reductions.md)). `GET /api/system/guardrails` returns today's checks per layer (input, output, action, human, control); no screen shows them. [ai-guardrails](docs/security/ai-guardrails.md) maps each common guardrail practice to the code and the test that covers it. A manual evaluation script (`pnpm ai:eval`) computes attack success, false-positive, task success and unauthorized-action rates; it calls the real API and only runs when the owner asks.

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
| `stub` | 4010 | Stands in for the LINE Messaging API and the Claude API (records requests, returns fixed or queued answers) |
| `seed` | | Loads sample data (a fictional café: contacts, messages, AI settings and a knowledge-base document) once the app is healthy, then exits; safe to run again with `docker compose run --rm seed`. Local Docker only: production never runs it and starts with an empty database |

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

Install once with `pnpm install` (Node 24 as in `.nvmrc`, pnpm version from `packageManager`).

| Suite | Command | Needs |
| --- | --- | --- |
| Format, lint, types | `pnpm format:check && pnpm lint && pnpm typecheck` | nothing |
| Unit (core, use cases with fakes, screen logic) with coverage | `pnpm test:coverage` (90% gate on `src/core/**`) | nothing |
| Adapters against Postgres and the stub | `docker compose up -d --wait db stub` then `pnpm test:adapters` | Docker |
| E2E, 15 journeys at 1280 px and 390 px | `docker compose up -d --build --wait db stub app`, `docker compose run --rm seed`, then `pnpm exec playwright install chromium` (first time) and `pnpm test:e2e` | Docker |
| Docs links, constants and the CI block | `pnpm docs:check` | nothing |
| Migration checks | `pnpm migrations:immutable && pnpm migrations:destructive` (CI); `pnpm migrations:applied` against the production database before a deploy ([deploy](docs/runbooks/deploy.md)) | git history; the last one needs `DIRECT_URL` |
| Production build | `pnpm build` | nothing |

E2E checks accessibility with axe on the welcome, chat and settings pages and fails on any console error or CSP violation. The strategy is in [test-strategy](docs/qa/test-strategy.md); the manual script for real LINE and Claude is [manual-test-script](docs/qa/manual-test-script.md).

## Deploy to Vercel and connect a real LINE OA

Follow [deploy](docs/runbooks/deploy.md) (Neon, Vercel, Blob store, Deploy Hook, CI on `main`) and then [line-oa-setup](docs/runbooks/line-oa-setup.md). Day-to-day operation is in [operations](docs/runbooks/operations.md).

Production environment variables (names only; meanings in [infrastructure](docs/architecture/infrastructure.md)):

`DATABASE_URL`, `DIRECT_URL`, `ACCESS_CODE`, `SESSION_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `FILE_STORAGE` (`blob`), `BLOB_READ_WRITE_TOKEN`, `APP_BASE_URL`. Optional: `POLL_INTERVAL_MS`, `AI_DEBOUNCE_MS`. Never set in production: `LINE_API_BASE_URL`, `LINE_DATA_API_BASE_URL`, `ANTHROPIC_BASE_URL`, `RATE_LIMIT_SCALE`.

The LINE OA profile picture is `public/brand/line-profile-1024.png` (the same icon as the browser tab, rendered by `scripts/render-brand-assets.ts`); upload it in LINE Official Account Manager as described in [line-oa-setup](docs/runbooks/line-oa-setup.md#7-รูปโปรไฟล์ของ-line-oa).

The LINE channel secret and access token are not environment variables: they are entered in the settings page and stored encrypted.

## Verified and not verified

The full account, with evidence, is in the [test report](docs/qa/test-report.md).

Verified by CI on every push to `main` (Chromium only):

- Lint, typecheck, unit tests with the core coverage gate, adapter tests against PostgreSQL and the stubs of LINE and Claude, the production build, the migration and docs checks, `pnpm audit` and a secret scan.
- All 16 E2E journeys at 1280 px and 390 px: receive, admin reply, AI reply, kill switch, pictures and videos, knowledge base, failed send, access code, topic guard, quoted replies, admin notes, rail, inbound audio, rich menu, welcome card and the settings tabs.

Verified by hand on production with a real LINE OA and the real Claude API (16 steps, all passed on 19 November 2026): text, pictures, stickers and voice messages from LINE; text, pictures and video to LINE; quoted replies; profile names and pictures; the AI reply with its name, the knowledge base and the handoff to an admin; the topic guard; the rich menu buttons and the welcome card; the kill switch. The AI quality question set ran against the real API for the three selectable models.

Not verified:

- Firefox and Safari; a real phone at 390 px (the narrow layout is emulated); HEIC photos from a real iPhone (the test file is synthetic).
- Load: there is no load test.
- Real LINE: the retry key on a second push, redelivered webhooks, the same-channel check of the credentials, and LINE being slow or down (covered with the stub only).
- Real Claude: prompt caching and the model fallback; the question set is small, so its numbers compare runs and are not statistics.
- On Vercel: a function that runs close to the 300-second limit, files near the size limits, and the memory used while a large video is stored.
- The daily refresh of a LINE profile (it needs data older than a day; covered by unit and repository tests).
- `docker compose up` on a machine with no existing images and volumes.

Known limits: one LINE OA per deployment, one shared access code without user accounts, polling rather than push updates, the AI does not read images or listen to voice messages, and the knowledge base is passed in the prompt rather than searched with embeddings ([ADR 0008](docs/adr/0008-knowledge-base-without-embeddings.md)). The open questions about external services are listed in the [implementation plan](docs/plans/implementation-plan.md#สิ่งที่ต้องยืนยันก่อนหรือระหว่างสร้าง).

## License

[MIT](LICENSE)
