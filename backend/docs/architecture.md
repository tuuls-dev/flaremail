# Architecture and invariants

## Runtime

Vite serves the Svelte SPA and Hono Worker on one origin. The exact same Worker entrypoint, Hono application, authorization policies, and Turso web client run locally and in production. Only environment values and provider simulation versus live sending change. CLI tools are not HTTP request paths; they also use Turso’s web client.

The receiving Worker is independently deployed and has no database access. Email Routing invokes its `email()` handler; it forwards raw MIME and envelope metadata to the main app’s HTTP webhook.

## Boundaries

- Frontend imports backend types and validation exclusively through `@flaremail/contracts`.
- Contracts contain no Worker bindings, secrets, SQL, or server imports.
- Transport decodes and validates; module services implement behavior; repositories/provider adapters implement storage and external I/O.
- Each backend module has an explicit public `index.ts`. Other modules and transports import that index, not internal files.
- `bun lint` checks these import boundaries. Keep SQL out of transport.
- Feature-specific frontend state and components stay inside the owning feature. Shared UI has no mail/business knowledge.
- Functions use verb-led names; variables describe the values they hold. Avoid generic utility buckets and unnecessary abstraction hierarchies.

## Wire interface

`POST /api/queries` and `POST /api/mutations` use CBOR maps containing JSON-RPC 2.0 envelopes. Requests and responses have `Content-Type: application/cbor`. The contract package defines method parameters and result schemas. CBOR byte strings carry binary chunks.

Requests support IDs, notifications, and batches of up to 50 operations. Batches run in order. Notifications return no RPC response; all-notification requests return HTTP 204. Invalid CBOR, envelopes, methods, and parameters use standard JSON-RPC codes. Application errors have a stable `error.data.kind`. Mutations are forbidden at the query endpoint, and the SDK never retries them automatically.

All application operations—including login, drafts, attachment transfers, and administration—use these endpoints. The inbound webhook is the deliberate exception.

## Identity and authorization

Users have global sign-in identities. Memberships carry organization roles. Mailbox grants are separate; an active organization membership plus an explicit grant is required for message access. Instance administrators can administer every organization but cannot implicitly read its messages.

Organization disabling affects that membership, not identities shared by other organizations. Delegated admins can reset passwords only for single-org, non-instance-admin accounts. Global credential changes revoke other sessions. Every protected RPC resolves the current session, preventing cached permissions from surviving revocation.

Passwords use scrypt with per-password random salts. Session tokens use cryptographic randomness; only their SHA-256 hashes are stored. Cookies are HttpOnly, SameSite Strict, and Secure on HTTPS. CBOR content types and origin checks protect browser mutations.

First-run setup is deliberately public, but its singleton and first admin are inserted in one write transaction. Concurrent setup requests cannot both succeed. Do not replace this with a check followed by independent inserts.

## Mail persistence

One Turso database stores relational metadata and binary data. Every mail operation authorizes the mailbox before querying it. Lists exclude message bodies and blobs, and return at most 40 conversations.

Raw MIME and attachments use ordered 256 KiB rows. Downloads and uploads are chunked. Attachment access is restricted to messages in an accessible mailbox or a draft belonging to the current user. Abandoned uploads are later collected.

Inbound delivery is keyed by envelope recipient plus the raw-content hash. Parsing and all persistence occur inside an atomic ingestion transaction. Headers alone do not determine the receiving mailbox. Threading uses RFC message references inside the same mailbox; subjects alone never merge conversations.

Shared mailbox read/star/folder/label state is shared. Drafts belong to an author, even in shared mailboxes. Version-based updates reject competing draft saves.

## Send invariants

Reserve a persistent send attempt before making a provider call. Never hold a transaction open while waiting for the provider. Idempotency keys and active-draft reservations prevent duplicate submissions.

Explicit provider rejections preserve an editable draft. Generic transport errors and interrupted submissions are ambiguous: lock them and require checking provider delivery logs. If the provider accepts but local Sent persistence fails, do not resend. Keep the provider ID in structured logs for reconciliation.

Incoming HTML is sanitized server-side and again before browser rendering. A sandboxed iframe and restrictive CSP isolate message contents. Remote images require explicit consent for the current view. No message scripts execute.
