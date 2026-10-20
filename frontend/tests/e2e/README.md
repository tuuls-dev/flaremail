# Browser verification

The implementation was checked against the actual one-port Vite/Workers runtime and a dedicated Turso Cloud development database, without replacing the API with browser mocks.

## Repeatable task checklist

Use an isolated database and `SEND_MODE=simulate`. Never run setup or seeded mail scenarios against production.

1. With migrations applied and no instance record, open `/instance/setup` without cookies or credentials. Create an administrator; verify the session and redirect to administration. Revisit setup and verify it cannot create a second admin.
2. Create an organization, add a domain, inspect its manual setup checklist, and mark it ready for simulation. Create a mailbox. Confirm it has no implicit access, then grant the administrator access explicitly.
3. Create a second organization and switch between them. Verify the organization heading, domain list, and actions use the same scope; open forms must not survive a scope change.
4. Submit fixtures through `/api/webhooks/inbound` or `SEED_MAILBOX=hello@example.com bun demo:seed`. Return to mail and verify list/detail navigation and unread state.
5. Press `C`, enter recipients, subject, and rich content. Save and reopen the draft. Verify content survives navigation/reload.
6. Choose a real file. Verify it appears only after upload completes, draft saving finishes, and the attachment remains when reopening the draft. Send through simulation; verify a Sent copy and attachment are present, and the draft disappears.
7. Search for sender, subject, and body text. Verify clearing search restores the previous mailbox context.
8. Select messages, archive them, and use Undo. Confirm mixed Inbox/Sent conversations retain their original per-message folders. Test stars and labels.
9. Open shortcut help and verify `J`, `K`, `Enter`, `X`, `E`, `R`, and Escape. While typing or interacting with a dialog/popover, global shortcuts must not steal input.
10. Select dark appearance through Settings. At a 390px viewport verify no horizontal overflow, mobile navigation closes after selection, and the floating Compose action opens a full-screen editor.
11. Inspect browser errors. Incoming script fixtures must not execute; remote image requests remain blocked until explicitly enabled. Inspect the iframe sandbox/CSP when checking hostile fixtures.

Automated coverage lives in `backend/tests/integration/`. `bun run test:runtime` performs additional read-only protocol checks against the running Worker. `bun lint` includes both server and Svelte type checks and architecture-boundary checks.

Live external delivery is deliberately not part of these checks: production domains, Email Routing rules, and the live sending binding must be configured separately.
