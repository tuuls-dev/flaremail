export const shortcuts = [
	{ action: "compose", key: "n", displayKey: "N", label: "Compose a message", context: "mailbox" },
	{ action: "search", key: "f", displayKey: "F", label: "Search this mailbox", context: "mailbox" },
	{
		action: "nextConversation",
		key: "arrowdown",
		displayKey: "↓",
		label: "Next conversation",
		context: "mailbox",
	},
	{
		action: "previousConversation",
		key: "arrowup",
		displayKey: "↑",
		label: "Previous conversation",
		context: "mailbox",
	},
	{
		action: "openConversation",
		key: "enter",
		displayKey: "↵",
		label: "Open focused conversation",
		context: "mailbox",
	},
	{
		action: "toggleSelection",
		key: "x",
		displayKey: "X",
		label: "Select focused conversation",
		context: "mailbox",
	},
	{
		action: "archive",
		key: "e",
		displayKey: "E",
		label: "Archive conversation",
		context: "mailbox",
	},
	{
		action: "reply",
		key: "r",
		displayKey: "R",
		label: "Reply to the conversation",
		context: "mailbox",
	},
	{
		action: "closeConversation",
		key: "arrowleft",
		displayKey: "←",
		label: "Back to the message list",
		context: "mailbox",
	},
	{
		action: "send",
		key: "enter",
		displayKey: "↵",
		label: "Send from the composer",
		context: "composer",
	},
	{
		action: "showHelp",
		key: "/",
		displayKey: "/",
		label: "Show keyboard shortcuts",
		context: "mailbox",
	},
] as const;

export type ShortcutAction = (typeof shortcuts)[number]["action"];
type ShortcutContext = (typeof shortcuts)[number]["context"];
type ShortcutPlatform = "mac" | "other";
type ShortcutEvent = Pick<
	KeyboardEvent,
	| "key"
	| "metaKey"
	| "ctrlKey"
	| "shiftKey"
	| "altKey"
	| "defaultPrevented"
	| "isComposing"
	| "repeat"
>;

export function readShortcutPlatform(
	platform = typeof navigator === "undefined" ? "" : navigator.platform,
): ShortcutPlatform {
	return /Mac|iPhone|iPad|iPod/i.test(platform) ? "mac" : "other";
}

export function readShortcutKeys(action: ShortcutAction, platform = readShortcutPlatform()) {
	const shortcut = shortcuts.find((item) => item.action === action)!;
	const modifier = platform === "mac" ? "⌘" : "Ctrl";
	const shiftModifier = platform === "mac" ? "⇧" : "Shift";
	return [modifier, shiftModifier, shortcut.displayKey];
}

export function formatShortcut(action: ShortcutAction, platform = readShortcutPlatform()) {
	const separator = platform === "mac" ? " " : "+";
	return readShortcutKeys(action, platform).join(separator);
}

export function matchShortcut(
	event: ShortcutEvent,
	context: ShortcutContext,
	platform = readShortcutPlatform(),
): ShortcutAction | undefined {
	const usesPrimaryModifier =
		platform === "mac" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
	const shouldIgnoreEvent = [
		!usesPrimaryModifier,
		!event.shiftKey,
		event.altKey,
		event.defaultPrevented,
		event.isComposing,
		event.repeat,
	].some(Boolean);

	if (shouldIgnoreEvent) {
		return;
	}

	// Shift+/ reports "?" on keyboards such as US English.
	const key = event.key === "?" ? "/" : event.key.toLowerCase();
	return shortcuts.find((shortcut) => shortcut.context === context && shortcut.key === key)?.action;
}

export function isTypingTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) {
		return false;
	}

	return Boolean(
		target.closest(
			'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
		),
	);
}

export function hasOpenShortcutOverlay(ignoredOverlay?: Element) {
	const overlays = document.querySelectorAll(
		'[role="dialog"],[role="alertdialog"],[data-popover-content][data-state="open"]',
	);
	return Array.from(overlays).some((overlay) => overlay !== ignoredOverlay);
}
