# Operations

## Environments

Keep development and production on separate Turso Cloud databases. Do not point test commands at production. Integration tests use isolated in-memory libSQL fixtures and never load the configured cloud database for their operations.

Both environments use the same deployed application code and Worker runtime. `SEND_MODE=simulate` is an explicit provider simulation that stores Sent messages without external delivery. Set `SEND_MODE=live` only after Cloudflare Email Sending and your sender domains are ready.

The compatibility date is `2026-10-19`. Keep the Worker config and generated types in sync when upgrading.

## Prepare production

Use Workers Paid for production. Password hashing needs an appropriate Workers CPU budget, and sending to arbitrary recipients requires the paid plan. Serve the app over HTTPS on its `workers.dev` hostname or a Worker custom domain. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/) · [Custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

Run these steps from the root of a checkout of the version you plan to deploy. For Wrangler, clone your own fork or template copy. For the Cloudflare button, you can use a checkout of upstream `main` to prepare the database before Cloudflare creates your copy. Install dependencies with `bun install --frozen-lockfile`.

1. [Create a dedicated Turso database](https://docs.turso.tech/cli/db/create) and a [database-scoped token with write access](https://docs.turso.tech/cli/db/tokens/create). Get the database’s libSQL URL with `turso db show <database-name> --url`.
2. Create a private copy of the example file. `.data/` is ignored by Git. Use a shell without exported Turso or administrator variables so the commands take their values from the files.

   ```sh
   mkdir -p .data
   install -m 600 .dev.vars.example .data/production.env
   ```

   Fill in both Turso values in `.data/production.env`, then apply the migrations.

   ```sh
   bun --no-env-file --env-file=.data/production.env run db:migrate
   ```

3. Before the Worker is public, create the first administrator with `bun admin:create`. Create `.data/admin.env` with mode `600` and set `INSTANCE_NAME`, `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Use a password between 12 and 128 characters. Run the command, then remove the temporary administrator file after it succeeds.

   ```sh
   bun --no-env-file --env-file=.data/production.env --env-file=.data/admin.env run admin:create
   ```

   Keep `.data/admin.env` local. The Worker needs only the Turso URL and token. The bootstrap command uses the same setup service as `/instance/setup` and refuses to initialize an instance that already has an administrator.

For updates, verify a Turso restore point and run `db:migrate` with the intended production database credentials before deploying code that depends on new migrations. Migrations are an explicit operator step.

### Deploy with Wrangler

1. In your copy of `wrangler.jsonc`, set `name` to the Worker name you want in your Cloudflare account. Keep `SEND_MODE` set to `simulate` during initial setup.
2. Authenticate with Wrangler, select the intended account if prompted, and upload both database secrets with the first deployment.

   ```sh
   bunx wrangler login
   bun run deploy --secrets-file .data/production.env
   ```

3. Open the HTTPS URL shown by Wrangler and sign in as the administrator you created. On later deployments, `bun run deploy` reuses secrets already saved to that Worker. Deploy an existing instance with both Turso secrets when upgrading from a version that set the database URL as a plain variable. [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code)

### Deploy from the Cloudflare dashboard

1. Open **Deploy to Cloudflare** from the upstream README. Choose your Cloudflare account, GitHub destination, and Worker name. Cloudflare copies the source repository and uses Workers Builds to deploy it.
2. Enter `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from the production preparation step as Worker runtime secrets in the deployment setup. If you need to manage them later, use **Settings → Variables and Secrets** on the Worker. Keep the runtime secrets out of Workers Builds variables.
3. Use the repository root as the root directory and `bun run deploy` as the deploy command. Leave the separate build command blank because `bun run deploy` builds both bundles. For a connected copy, pushes to the production branch trigger deployments, so apply required database migrations before pushing that branch. [Deploy to Cloudflare](https://developers.cloudflare.com/workers/platform/deploy-buttons/) · [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
4. Open the Worker’s HTTPS URL and sign in with the administrator you created.

Vite emits the browser assets and Worker bundle into separate directories. The deployment publishes `dist/client` as static assets and uses `dist/worker/wrangler.json` for the Worker.

## Cloudflare email

1. Enable Email Sending and onboard each sender domain. Publish the supplied SPF and DKIM records and your DMARC policy. The Worker already declares the native `EMAIL` binding.
2. Enable Email Routing and publish its MX records for the inbound domain. In the dashboard, set the address rules or catch-all rule to **Send to a Worker** and select the Worker name you deployed.
3. In Flaremail, create an organization, add the domain, and mark it ready after setting up Cloudflare and DNS. Create a mailbox under that domain and use **Access** to grant your administrator access.
4. Set `SEND_MODE` to `live` in your copy of `wrangler.jsonc` and redeploy through your chosen path. Send a message from an address you control to the mailbox, confirm it appears in Flaremail, and reply to verify outbound delivery.

The Worker’s `email()` handler gets the SMTP envelope from Cloudflare. It rejects messages exceeding 5 MiB and mail for unavailable mailboxes or unready domains. Unexpected ingestion failures are retried up to twice and then surface as Worker errors.

See the [sending binding](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [Email Routing rules](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/), and [Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) documentation.

## Send recovery

The provider response means accepted, not delivered. Consult Cloudflare delivery logs for bounces, suppression, or later failures.

For `unknown` sends, first inspect provider logs using the logged provider/message ID or attempt correlation. Do not blindly delete reservations or resend. A reservation with an uncertain outcome is intentionally non-editable. Once an operator establishes whether it was accepted, reconcile its state in the database deliberately. An automatic reconciliation UI is not part of this version.

## Maintenance and observability

Run `bun db:maintenance` periodically against the intended database. It removes expired sessions/login counters, deletes old unreferenced uploads, and marks interrupted pending sends unknown. It does not delete messages or automatically empty Trash.

Worker logs and traces are enabled. Structured application events avoid message bodies, passwords, raw MIME, and tokens. Provider IDs may appear in send-recovery logs. Review operational limits and log sampling as traffic grows.

Migrations store checksums and refuse modified applied files. Add a new numbered migration for any schema change. Take or verify a Turso restore point before production migrations; do not run destructive repair against a shared database.
