# Browser verification

The implementation was checked against the actual one-port Vite/Workers runtime and a dedicated Turso Cloud development database, without replacing the API with browser mocks.

## Repeatable task checklist

Use an isolated database and `SEND_MODE=simulate`. Never run setup or seeded mail scenarios against production.

1. With migrations applied and no instance record, open `/instance/setup` without cookies or credentials. Create an administrator; verify the session and redirect to administration. Revisit setup and verify it cannot create a second admin.
2. Create an organization, add a domain, inspect its manual setup checklist, and mark it ready for simulation. Create a mailbox. Confirm it has no implicit access, then grant the administrator access explicitly.
3. Create a second organization and switch between them. Verify the organization heading, domain list, and actions use the same scope; open forms must not survive a scope change.
4. With the local Vite server running, submit fixtures through its email simulator with `SEED_MAILBOX=hello@example.com bun demo:seed`. Return to mail and verify list/detail navigation and unread state.
5. Press `Cmd+Shift+N` on macOS or `Ctrl+Shift+N` on Windows/Linux, enter recipients, subject, and rich content. Save and reopen the draft. Verify content survives navigation/reload. Use `Cmd/Ctrl+Shift+Enter` to send; the old `Cmd/Ctrl+Enter` shortcut must not send.
6. Choose a real file. Verify it appears only after upload completes, draft saving finishes, and the attachment remains when reopening the draft. Send through simulation; verify a Sent copy and attachment are present, and the draft disappears.
7. Search for sender, subject, and body text. Verify clearing search restores the previous mailbox context.
8. Select messages, archive them, and use Undo. Confirm mixed Inbox/Sent conversations retain their original per-message folders. Test stars and labels.
9. Open shortcut help with `Cmd/Ctrl+Shift+/`. All app shortcuts require `Cmd+Shift` on macOS or `Ctrl+Shift` on Windows/Linux: `N` compose, `F` search, `↓`/`↑` next/previous conversation, `Enter` open, `X` select, `E` archive, `R` reply, and `←` return to the list. Verify help, tooltips, and inline hints show the platform's combinations. Single-key `C`, `/`, `J`, `K`, `X`, `E`, `R`, `?`, and Escape must not trigger mailbox actions. Unmodified Enter may still activate a focused link/button. While typing or interacting with a dialog/popover, global shortcuts must not steal input; Escape still dismisses overlays normally. Verify Send works while typing in the composer but not while busy/locked or in a nested confirmation/link dialog or popover. Check extra modifiers, repeats, handled events, and IME composition do not trigger actions. Verify conflicting browser combinations are intercepted where permitted, and document any browser-reserved combinations.
10. Select dark appearance through Settings. At a 390px viewport verify no horizontal overflow, mobile navigation closes after selection, and the floating Compose action opens a full-screen editor.
11. Inspect browser errors. Incoming script fixtures must not execute; remote image requests remain blocked until explicitly enabled. Inspect the iframe sandbox/CSP when checking hostile fixtures.

## Conversation regressions (issue #4)

- Leave a thread open, send a reply, then deliver another reply. Check the reader after Send, manual Refresh, window focus, and the 15-second poll. Existing content should remain visible during refresh. Close/switch the reader while a response is delayed and verify it cannot repopulate the previous conversation.
- Check that Inbox, Sent, search, and label results show the full conversation count and newest preview, including sent replies.
- Deliver two HTML messages that both reference `cid:logo`, with different attachments. Load each message’s inline images; each must retain its own image. Switch conversations while an attachment is loading and verify no image leaks into the next view.
- Compare a short HTML reply with a body taller than 1,500px. Resize the viewport and load images: frame height should track the body without large blank space or nested vertical scrolling. Expand/collapse quoted history and check that height follows both changes.
- Verify colored/font-sized signatures and table widths, padding, and alignment survive. Test scripts, event handlers, CSS `url()`, and remote backgrounds: none should execute or load. Remote `<img>` requests must still require consent.
- Deliver a reply before its parent, siblings before their parent, and a message linking two previously separate reference chains. Verify each chain becomes one conversation, without joining unrelated mail or another mailbox.

Automated coverage lives in `backend/tests/integration/`. `bun run test:runtime` performs additional read-only protocol checks against the running Worker. `bun lint` includes both server and Svelte type checks and architecture-boundary checks.

Live external delivery is deliberately not part of these checks: production domains, Email Routing rules, and the live sending binding must be configured separately.
