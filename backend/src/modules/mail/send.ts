/* eslint-disable no-await-in-loop -- Sequential transaction operations and bounded binary transfers must not execute concurrently. */
import { AppError, MAX_MESSAGE_SIZE, email } from "@flaremail/contracts";
import type { User, Params, Result, Draft } from "@flaremail/contracts";
import type { Row } from "@libsql/client";
import {
	findRecord,
	readStringField,
	readNumberField,
	runInTransaction,
} from "../../platform/database/client";
import type { Database, Executor } from "../../platform/database/client";
import { requireMailbox } from "../mailboxes/index";
import { findDraft, mapDraftRecord } from "./drafts";
import { readBlob } from "./blobs";
import { encodeBase64 } from "../../platform/email/sender";
import type { Sender, OutgoingEmail } from "../../platform/email/sender";
import { logEvent } from "../../platform/observability/log";
type Outcome = Result<"mail.send">;

function readSendOutcome(record: Row): Outcome {
	const stale =
		record.status === "pending" && Date.now() - readNumberField(record, "updated_at") > 120000;
	return {
		status: stale ? "unknown" : (record.status as Outcome["status"]),
		messageId: record.message_id ? readStringField(record, "message_id") : null,
		error: stale
			? "The provider outcome is unknown. Check delivery logs before sending a new message."
			: (record.error as string | null),
	};
}

async function loadOutgoing(
	database: Executor,
	draft: Draft,
	address: string,
): Promise<OutgoingEmail> {
	if (!draft.to.length && !draft.cc.length && !draft.bcc.length) {
		throw new AppError("VALIDATION", "Add at least one recipient.");
	}

	validateRecipients(draft);

	const content = draft.html + draft.text + draft.subject;
	let size = new TextEncoder().encode(content).length + 4096;
	const attachments: OutgoingEmail["attachments"] = [];

	for (const id of draft.attachmentIds) {
		const blob = await findRecord(database, "SELECT * FROM blobs WHERE id=? AND draft_id=?", [
			id,
			draft.id,
		]);

		if (!blob) {
			throw new AppError("VALIDATION", "Attachment is unavailable.");
		}

		const base64Groups = readNumberField(blob, "size") / 3;
		size += Math.ceil(base64Groups) * 4 + 512;

		if (size > MAX_MESSAGE_SIZE) {
			throw new AppError("VALIDATION", "Encoded message exceeds the 5 MiB sending limit.");
		}

		const bytes = await readBlob(database, id);
		attachments.push(buildOutgoingAttachment(blob, bytes));
	}

	if (size > MAX_MESSAGE_SIZE) {
		throw new AppError("VALIDATION", "Message is too large.");
	}

	const headers: Record<string, string> = {};

	if (draft.replyToMessageId) {
		headers["In-Reply-To"] = draft.replyToMessageId;
		headers.References = draft.replyToMessageId;
	}

	return {
		from: address,
		to: draft.to,
		cc: draft.cc,
		bcc: draft.bcc,
		subject: draft.subject,
		text: draft.text,
		html: draft.html,
		headers,
		attachments,
	};
}

async function recordSent(
	transactionDatabase: Executor,
	draft: Draft,
	address: string,
	name: string,
	messageId: string,
) {
	const id = crypto.randomUUID();
	const parent = draft.replyToMessageId
		? await findRecord(
				transactionDatabase,
				"SELECT thread_id FROM messages WHERE mailbox_id=? AND message_id=? LIMIT 1",
				[draft.mailboxId, draft.replyToMessageId],
			)
		: undefined;
	await transactionDatabase.execute({
		sql: "INSERT INTO messages (id,mailbox_id,thread_id,message_id,in_reply_to,subject,sender,sender_name,to_json,cc_json,bcc_json,text,html,snippet,received_at,direction,folder,unread) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'outbound','sent',0)",
		args: [
			id,
			draft.mailboxId,
			parent ? readStringField(parent, "thread_id") : id,
			messageId,
			draft.replyToMessageId ?? "",
			draft.subject,
			address,
			name,
			JSON.stringify(draft.to),
			JSON.stringify(draft.cc),
			JSON.stringify(draft.bcc),
			draft.text,
			draft.html,
			draft.text.replace(/\s+/g, " ").slice(0, 240),
			Date.now(),
		],
	});

	for (const blobId of draft.attachmentIds) {
		await transactionDatabase.execute({
			sql: "INSERT INTO message_attachments (message_id,blob_id) VALUES (?,?)",
			args: [id, blobId],
		});
	}

	await transactionDatabase.execute({ sql: "DELETE FROM drafts WHERE id=?", args: [draft.id] });
}

export async function sendMail(
	database: Database,
	user: User | null,
	input: Params<"mail.send">,
	sender: Sender,
): Promise<Outcome> {
	const mailbox = await requireMailbox(database, user, input.mailboxId);
	const existing = await findRecord(
		database,
		"SELECT * FROM send_attempts WHERE idempotency_key=? AND mailbox_id=? AND author_id=?",
		[input.idempotencyKey, input.mailboxId, user!.id],
	);

	if (existing) {
		return readSendOutcome(existing);
	}

	const domain = await findRecord(
		database,
		"SELECT ready FROM domains WHERE id=(SELECT domain_id FROM mailboxes WHERE id=?)",
		[input.mailboxId],
	);

	if (!domain?.ready) {
		throw new AppError("VALIDATION", "An administrator must complete domain setup before sending.");
	}

	const record = await findDraft(database, input.draftId, input.mailboxId, user!.id);

	if (!record) {
		throw new AppError("NOT_FOUND", "Draft not found.");
	}

	const draft = mapDraftRecord(record);

	if (draft.version !== input.version) {
		throw new AppError("CONFLICT", "Draft changed. Save and review it before sending.");
	}

	const outgoing = await loadOutgoing(database, draft, mailbox.address);
	const reserved = await reserveSendAttempt(database, user!.id, input);

	if (reserved) {
		return reserved;
	}

	let providerId: string;

	try {
		const accepted = await sender.send(outgoing);
		providerId = accepted.messageId;
	} catch (error) {
		return recordProviderFailure(database, input.idempotencyKey, error);
	}

	try {
		await runInTransaction(database, async (transactionDatabase) => {
			await recordSent(transactionDatabase, draft, mailbox.address, mailbox.name, providerId);
			await transactionDatabase.execute({
				sql: "UPDATE send_attempts SET status='sent',message_id=?,updated_at=? WHERE idempotency_key=?",
				args: [providerId, Date.now(), input.idempotencyKey],
			});
		});
	} catch {
		logEvent("send.persistence_failed", { attemptId: input.idempotencyKey, providerId });

		try {
			await database.execute({
				sql: "UPDATE send_attempts SET status='unknown',message_id=?,error='Provider accepted; local persistence failed.',updated_at=? WHERE idempotency_key=?",
				args: [providerId, Date.now(), input.idempotencyKey],
			});
		} catch {
			/* Keep the reservation: never automatically resend an accepted message. */
		}

		return {
			status: "unknown",
			messageId: providerId,
			error: "Provider accepted the message, but saving Sent failed. Do not resend.",
		};
	}

	return { status: "sent", messageId: providerId, error: null };
}

async function reserveSendAttempt(database: Database, userId: string, input: Params<"mail.send">) {
	return runInTransaction(database, async (transactionDatabase) => {
		const active = await findRecord(
			transactionDatabase,
			"SELECT * FROM send_attempts WHERE draft_id=? AND status IN ('pending','sent','unknown')",
			[input.draftId],
		);

		if (active) {
			return readSendOutcome(active);
		}

		const current = await findDraft(transactionDatabase, input.draftId, input.mailboxId, userId);

		if (!current || readNumberField(current, "version") !== input.version) {
			throw new AppError("CONFLICT", "Draft changed. Save and review it before sending.");
		}

		const now = Date.now();
		await transactionDatabase.execute({
			sql: "INSERT INTO send_attempts (idempotency_key,draft_id,mailbox_id,author_id,status,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?)",
			args: [input.idempotencyKey, input.draftId, input.mailboxId, userId, now, now],
		});
		return null;
	});
}

async function recordProviderFailure(
	database: Database,
	attemptId: string,
	error: unknown,
): Promise<Outcome> {
	const code = error instanceof Error && "code" in error ? String(error.code) : "";
	const rejected = [
		"E_VALIDATION_ERROR",
		"E_FIELD_MISSING",
		"E_TOO_MANY_RECIPIENTS",
		"E_TOO_MANY_ATTACHMENTS",
		"E_SENDER_NOT_VERIFIED",
		"E_RECIPIENT_NOT_ALLOWED",
		"E_RECIPIENT_SUPPRESSED",
		"E_SENDER_DOMAIN_NOT_AVAILABLE",
		"E_CONTENT_TOO_LARGE",
		"E_RATE_LIMIT_EXCEEDED",
		"E_DAILY_LIMIT_EXCEEDED",
		"E_HEADER_NOT_ALLOWED",
		"E_HEADER_VALUE_INVALID",
	].includes(code);
	const status = rejected ? "failed" : "unknown";
	const message = rejected
		? `Provider rejected this message (${code}). Your draft is safe.`
		: "Delivery outcome is unknown. Check provider logs before sending a new message.";
	await database.execute({
		sql: "UPDATE send_attempts SET status=?,error=?,updated_at=? WHERE idempotency_key=?",
		args: [status, message, Date.now(), attemptId],
	});
	return { status, messageId: null, error: message };
}

function validateRecipients(draft: Draft) {
	const allRecipients = draft.to.concat(draft.cc, draft.bcc);

	if (allRecipients.some((recipient) => !email.safeParse(recipient).success)) {
		throw new AppError("VALIDATION", "Check the recipient email addresses before sending.");
	}

	const visibleRecipients = draft.to.length + draft.cc.length;
	const recipientCount = visibleRecipients + draft.bcc.length;

	if (recipientCount > 50) {
		throw new AppError("VALIDATION", "A message may have at most 50 recipients.");
	}
}

function buildOutgoingAttachment(
	blob: Row,
	bytes: Uint8Array,
): OutgoingEmail["attachments"][number] {
	const common = {
		filename: readStringField(blob, "filename"),
		type: readStringField(blob, "content_type"),
		content: encodeBase64(bytes),
	};

	if (blob.content_id) {
		return Object.assign(common, {
			disposition: "inline" as const,
			contentId: readStringField(blob, "content_id"),
		});
	}

	return Object.assign(common, { disposition: "attachment" as const });
}
