# Operations

## Environments

Keep development and production on separate Turso Cloud databases. Do not point test commands at production. Integration tests use isolated in-memory libSQL fixtures and never load the configured cloud database for their operations.

Both environments use the same deployed application code and Worker runtime. `SEND_MODE=simulate` is an explicit provider simulation that stores Sent messages without external delivery. Set `SEND_MODE=live` only after Cloudflare Email Sending and your sender domains are ready.

The compatibility date is `2026-10-19`: the newest date supported by the installed workerd binary during implementation. Keep both Worker configs and generated types in sync when upgrading.

## Prepare production

1. Create a production Turso database and a database-scoped token.
2. Run `bun db:migrate` with the **production** URL/token explicitly supplied in that command’s environment. Migrations are not run by web requests or by deployment.
3. Set `TURSO_DATABASE_URL`, `APP_ORIGIN` (your exact HTTPS origin), and `SEND_MODE` in the application Worker configuration. Never put the token in tracked JSON.
4. Store `TURSO_AUTH_TOKEN` using `bunx wrangler secret put TURSO_AUTH_TOKEN --config backend/wrangler.jsonc`.
5. Configure a Worker custom domain and use HTTPS. Password hashing requires an appropriate Workers CPU budget; use a paid Worker for the application.
6. Build and deploy with `bun run deploy`. Vite emits separate browser and Worker directories; only the client directory is public assets. Do not publish the Worker artifact directory as static hosting.
7. Complete `/instance/setup` on the production instance immediately. It intentionally has no authentication before initial setup.

A successful build or deploy dry run does not prove external mail delivery. Verify production with real addresses you control.

## Cloudflare email

- Enable Email Sending and onboard each sender domain. Publish the supplied SPF/DKIM records and a deliberate DMARC policy.
- Configure the main Worker’s native `EMAIL` binding. No SMTP credentials are used in the selected architecture.
- Set `backend/email-routing/wrangler.jsonc`’s `INBOUND_URL` to the deployed app’s `/api/webhooks/inbound` URL and deploy the receiver.
- Enable Email Routing and publish its MX records. Point domain/address rules or a catch-all rule at `flaremail-receiver` in the dashboard.
- Mark the domain ready in Flaremail only after completing these manual steps. The app does not claim to have verified Cloudflare configuration.
- The inbound endpoint intentionally has no authentication. It still validates envelope metadata and application size limits. Receiving into disabled mailboxes or unready domains is rejected.

Documentation: [sending binding](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [Email Routing](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/), [Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/).

## Send recovery

The provider response means accepted, not delivered. Consult Cloudflare delivery logs for bounces, suppression, or later failures.

For `unknown` sends, first inspect provider logs using the logged provider/message ID or attempt correlation. Do not blindly delete reservations or resend. A reservation with an uncertain outcome is intentionally non-editable. Once an operator establishes whether it was accepted, reconcile its state in the database deliberately. An automatic reconciliation UI is not part of this version.

## Maintenance and observability

Run `bun db:maintenance` periodically against the intended database. It removes expired sessions/login counters, deletes old unreferenced uploads, and marks interrupted pending sends unknown. It does not delete messages or automatically empty Trash.

Worker logs and traces are enabled. Structured application events avoid message bodies, passwords, raw MIME, and tokens. Provider IDs may appear in send-recovery logs. Review operational limits and log sampling as traffic grows.

Migrations store checksums and refuse modified applied files. Add a new numbered migration for any schema change. Take or verify a Turso restore point before production migrations; do not run destructive repair against a shared database.
