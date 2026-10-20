# Flaremail

A self-hosted, multi-organization email application. Hono + Svelte 5, JSON-RPC over CBOR, Cloudflare Workers, and Turso Cloud.

## Start locally

```sh
bun install
# Configure .env and backend/.dev.vars as described below.
bun dev
```

Open **http://127.0.0.1:5173/instance/setup** to name the instance and create the first administrator. This first-run page and its setup RPC are intentionally public. Setup succeeds only once, enforced by a transactional singleton in the database. Subsequent visits show that setup is complete.

`bun dev` applies pending migrations and starts Vite. Both the SPA and Hono API use port 5173. The API runs in the Cloudflare Vite plugin’s Worker runtime in both development and production: **no sqld, local SQLite adapter, or alternate development API**.

### Turso configuration

Development and production both connect to Turso Cloud using `@libsql/client/web`. Use separate databases for isolation.

```sh
turso db create flaremail-development
turso db show flaremail-development --url
turso db tokens create flaremail-development --expiration 30d
```

Put the connection values in two ignored files:

- `.env`: used by Bun migration and maintenance scripts.
- `backend/.dev.vars`: used by Wrangler’s local Worker runtime.

```dotenv
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-database-scoped-token
APP_ORIGIN=http://127.0.0.1:5173
SEND_MODE=simulate
```

A dedicated `flaremail-development` cloud database has been configured in this workspace. Its local development token expires after 30 days; renew it if needed. Credentials are not committed.

### Provision mail

1. Complete instance setup.
2. Create an organization in Administration.
3. Add a domain and follow its manual Cloudflare setup checklist.
4. Create a mailbox.
5. Open **Access** and grant yourself or an active org member access. Administrators do not automatically get message access.
6. Return to mail.

Development uses simulated sending: accepted messages are saved in Sent but no external email is delivered. The receiving webhook works against the same application code locally.

### Reset the development database

Stop the dev server, then run:

```sh
bun reset:devdb
bun dev
```

This permanently removes **all development data**, rebuilds the schema from migrations, and makes `/instance/setup` available again. It reads the database URL and token directly from `backend/.dev.vars`, not shell overrides or `.env`. The command refuses `NODE_ENV=production` and requires a Turso Cloud database with `dev` or `development` as a hyphen-delimited part of its name, such as `flaremail-development`.

To ingest a fixture after creating `hello@example.com` and marking its domain ready:

```sh
curl http://127.0.0.1:5173/api/webhooks/inbound \
  -H 'Content-Type: message/rfc822' \
  -H 'X-Envelope-From: jordan@example.net' \
  -H 'X-Envelope-To: hello@example.com' \
  --data-binary @backend/tests/fixtures/conversation.eml
```

The inbound webhook is intentionally unauthenticated for this version. Delivery uses the **envelope recipient**, not the MIME To/Cc headers. The application accepts messages up to 5 MiB.

## Commands

| Command                   | Purpose                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `bun dev`                 | Migrate the development cloud database and run one-port Vite/Workers |
| `bun lint`                | Lint, formatting, import boundaries, TypeScript, and Svelte checks   |
| `bun test`                | Isolated integration tests; never touches the cloud database         |
| `bun run build`           | Build browser assets and production Worker                           |
| `bun run types`           | Regenerate both Workers’ binding/runtime types                       |
| `bun db:migrate`          | Apply immutable, checksum-verified SQL migrations                    |
| `bun reset:devdb`         | Erase development data and rebuild a fresh first-run database        |
| `bun db:maintenance`      | Clean expired sessions and abandoned uploads; flag interrupted sends |
| `bun admin:create`        | Optional CLI alternative to first-run UI setup                       |
| `bun run deploy`          | Build and deploy the application Worker                              |
| `bun run deploy:receiver` | Deploy the Email Routing Worker                                      |

For CLI bootstrap, set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in your shell or ignored environment file. The password must contain at least 12 characters. The same one-time setup invariant applies.

## Layout

```text
backend/
  contracts/       Browser-safe schemas, wire types, RPC method registry
  src/transport/   CBOR dispatcher and inbound HTTP adapter
  src/modules/     Identity, organizations, domains, mailboxes, mail, audit
  src/platform/    Turso, email provider, security, structured logging
  email-routing/   Independent receiving Worker
  migrations/      Ordered SQL migrations
  scripts/         Development, migration, bootstrap, maintenance, boundaries
  tests/           Integration scenarios and MIME fixtures
frontend/
  src/app/         App bootstrap, router, layouts
  src/features/    Auth, workspace, mailbox, compose, settings, administration
  src/sdk/         Typed CBOR transport and binary transfers
  src/components/  Reusable, accessible UI primitives
  src/keyboard/    Shortcut definitions and typing-context detection
  src/styles/      variables.css and bootstrap.css only
```

See [architecture](backend/docs/architecture.md), [operations](backend/docs/operations.md), [experience design](frontend/docs/experience.md), and the [browser verification checklist](frontend/tests/e2e/README.md).

## Version boundaries

Included: rich composition, personal/shared mailboxes, conversations, attachments, drafts, search, labels, bulk triage, responsive layouts, dark theme, keyboard controls, and delegated administration.

Not included: IMAP/POP, public signup, contacts, aliases, automatic filtering, spam classification, push notifications, or automatic trash expiry. Sent means the provider accepted a submission, not that the recipient received it. This repository is not yet deployed to a public domain.
