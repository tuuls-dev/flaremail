# Experience design

## People and jobs

These are implementation hypotheses to validate with real users, not claims of completed user research.

| Person         | Job                                        | Primary design constraint                                   |
| -------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Mail user      | Find, understand, and act on conversations | Scanning and triage must stay fast and predictable          |
| Org admin      | Provision the right access                 | Organization context must always be visible                 |
| Instance admin | Operate the installation                   | Global authority must not look like implicit mailbox access |

## Information architecture

Mail, account settings, and administration have separate layouts. Routine inbox work does not compete with infrastructure controls. Organization and mailbox identifiers live in routes so deep links and browser history retain context. The composer fixes its sender mailbox when opened, even if navigation changes behind it.

Administration distinguishes creating a global identity from adding an existing person to an organization. Adding a person does not imply mailbox access. Grant dialogs explicitly state that both reading and sending are permitted.

## Visual system

A restrained neutral palette, graphite text, and indigo accent establish hierarchy without dashboard decoration. Color is not the sole indicator of state. Typography, spacing, borders, and alignment communicate grouping. Light and dark themes share semantic tokens.

`variables.css` holds Tailwind-style token names. `bootstrap.css` holds reset and global design-system foundations. Feature styling belongs to the relevant Svelte component. There is no Tailwind or Bootstrap framework dependency.

## Workflows

### Scanning and triage

Desktop uses a persistent sidebar, message list, and reading pane. On smaller screens, list and conversation become separate views. Rows prioritize sender, subject, preview, timestamp, unread state, and attachments. Selection exposes contextual actions. Archive and trash provide Undo. Polling must not steal focus, clear valid selection, or reorder the conversation currently being read.

### Reading

Conversation headers expose sender identity, recipients, time, and useful actions. Secondary details use disclosure rather than permanent clutter. Unsafe HTML never executes. Image controls explain why remote content is initially hidden. Attachments expose filename and size before download.

### Composing

The sender address stays visible. Cc/Bcc are progressive disclosure. Formatting is available without turning the editor into a full document application. Saved, saving, unsaved, upload, error, and sending states are explicit.

Closing preserves the draft; discarding is separate and confirmed. Network errors preserve content. Competing saves produce a persistent conflict rather than overwriting another tab. Unknown send outcomes do not offer a misleading automatic retry.

### Empty and error states

Differentiate empty inboxes, empty drafts, search misses, missing access, unconfigured domains, and network failures. Each state explains the next useful action. Inline errors remain visible; Sonner supplements them rather than being the only location for critical failures.

## Human interaction details

- Every shortcut has a pointer-accessible equivalent and appears in the shortcut-help Dialog.
- Global shortcuts are suppressed while typing or while an overlay owns interaction.
- Dialog and Popover use Bits UI primitives for focus, dismissal, and accessibility.
- Focus indicators are visible; controls have accessible names; layout respects reduced motion.
- Context switches cancel or ignore stale responses. Background polling preserves user activity.
- Mobile navigation and full-screen composition prioritize usable touch targets over visual density.
- No fake message counts, provider verification results, or delivery confirmations are displayed.

## Validation scenarios

Walk through first-run setup, organization/domain/mailbox creation, explicit self-grant, sign-in, reading, replying, searching, downloading, and keyboard-only triage. Repeat at narrow widths and in dark mode. Test failures by interrupting saves and uploads, expiring sessions, revoking access, and simulating provider uncertainty.
