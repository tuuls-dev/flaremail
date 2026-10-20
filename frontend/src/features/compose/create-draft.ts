import type { DraftInput, Message } from "@flaremail/contracts";

export function createEmptyDraft(mailboxId: string): DraftInput {
	return {
		id: crypto.randomUUID(),
		mailboxId,
		version: 0,
		to: [],
		cc: [],
		bcc: [],
		subject: "",
		html: "",
		text: "",
		replyToMessageId: null,
		attachmentIds: [],
	};
}

export function createReplyDraft(
	mailboxId: string,
	ownAddress: string,
	message: Message,
	mode: "reply" | "replyAll" | "forward",
) {
	const draft = createEmptyDraft(mailboxId);
	const prefix = mode === "forward" ? "Fwd: " : "Re: ";
	draft.subject = /^(re|fwd?):/i.test(message.subject) ? message.subject : prefix + message.subject;

	if (mode !== "forward") {
		const replyRecipients =
			message.direction === "outbound" ? message.to : [message.replyTo || message.sender];
		draft.to = replyRecipients.filter(
			(address) => address.toLowerCase() !== ownAddress.toLowerCase(),
		);
		draft.replyToMessageId = message.messageId;
	}

	if (mode === "replyAll") {
		const recipients = message.to
			.concat(message.cc)
			.filter((address) => address.toLowerCase() !== ownAddress.toLowerCase());
		draft.cc = Array.from(new Set(recipients)).filter((address) => !draft.to.includes(address));
	}

	if (mode === "forward") {
		draft.html = `<p></p><p>---------- Forwarded message ----------</p><p>From: ${escapeHtml(message.sender)}<br>Subject: ${escapeHtml(message.subject)}</p><blockquote>${message.html || escapeHtml(message.text).replaceAll("\n", "<br>")}</blockquote>`;
		draft.text = `\n\n---------- Forwarded message ----------\nFrom: ${message.sender}\nSubject: ${message.subject}\n\n${message.text}`;
	}

	return draft;
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
