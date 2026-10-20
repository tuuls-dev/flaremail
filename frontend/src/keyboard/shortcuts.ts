export const shortcuts = [
	{ keys: ["C"], label: "Compose a message" },
	{ keys: ["/"], label: "Search this mailbox" },
	{ keys: ["J"], label: "Next conversation" },
	{ keys: ["K"], label: "Previous conversation" },
	{ keys: ["↵"], label: "Open focused conversation" },
	{ keys: ["X"], label: "Select focused conversation" },
	{ keys: ["E"], label: "Archive conversation" },
	{ keys: ["R"], label: "Reply to the conversation" },
	{ keys: ["Esc"], label: "Back to the message list" },
	{ keys: ["⌘ / Ctrl", "↵"], label: "Send from the composer" },
	{ keys: ["?"], label: "Show keyboard shortcuts" },
];

export function isTypingTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return Boolean(
		target.closest(
			'input,textarea,select,[contenteditable="true"],[role="textbox"],[data-popover-content]',
		),
	);
}
