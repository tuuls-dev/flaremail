/* eslint-disable no-await-in-loop -- MIME chunks are written sequentially inside one transaction to bound memory and preserve atomic ingestion. */
import PostalMime from "postal-mime";
import type { Email, Address } from "postal-mime";
import { AppError, MAX_MESSAGE_SIZE } from "@flaremail/contracts";
import type { Database, Executor } from "../../platform/database/client";
import { findRecord, readStringField, runInTransaction } from "../../platform/database/client";
import { hashSha256 } from "../../platform/security/password";
import { sanitizeEmail } from "../../platform/email/sanitize";
import { putBlob } from "./blobs";

function readAddresses(addresses: Address[] | undefined) {
	return (addresses ?? []).flatMap((address) => (address.address ? [address.address] : []));
}

function readReferences(parsedEmail: Email): string[] {
	const referenceHeader = parsedEmail.references ?? "";
	const referenceMatches = referenceHeader.match(/<[^>]+>/g) ?? [];
	const references: string[] = Array.from(referenceMatches);

	if (parsedEmail.inReplyTo) {
		references.push(parsedEmail.inReplyTo);
	}

	return references;
}

async function resolveThreadId(
	database: Executor,
	mailboxId: string,
	references: string[],
	fallbackId: string,
	messageId: string,
) {
	const relatedIds = JSON.stringify([messageId].concat(references).filter(Boolean));
	// Match parents, early children, and siblings that reference a not-yet-delivered ancestor.
	const relatedMessages = await database.execute({
		sql: `SELECT DISTINCT m.thread_id FROM messages m WHERE m.mailbox_id=? AND (
			m.message_id IN (SELECT value FROM json_each(?)) OR
			m.in_reply_to IN (SELECT value FROM json_each(?)) OR
			EXISTS (SELECT 1 FROM json_each(m.references_json) r WHERE r.value IN (SELECT value FROM json_each(?)))
		) ORDER BY m.thread_id`,
		args: [mailboxId, relatedIds, relatedIds, relatedIds],
	});
	const threadIds = relatedMessages.rows.map((record) => readStringField(record, "thread_id"));
	const threadId = threadIds[0] ?? fallbackId;

	if (threadIds.length > 1) {
		await database.execute({
			sql: `UPDATE messages SET thread_id=? WHERE mailbox_id=? AND thread_id IN (${threadIds.map(() => "?").join(",")})`,
			args: [threadId, mailboxId].concat(threadIds),
		});
	}

	return threadId;
}

function readReceivedAt(date: string | undefined) {
	const now = Date.now();
	const parsedDate = date ? Date.parse(date) : now;
	return Number.isFinite(parsedDate) ? Math.min(parsedDate, now) : now;
}

function readHeaderValue(value: string | undefined, fallback = "") {
	return value ?? fallback;
}

function readReplyAddress(parsedEmail: Email) {
	return parsedEmail.replyTo?.[0]?.address ?? "";
}

function buildMessageValues(
	parsedEmail: Email,
	metadata: {
		messageId: string;
		mailboxId: string;
		threadId: string;
		dedupKey: string;
		rawBlobId: string;
		envelopeFrom: string;
	},
) {
	const sourceHtml = parsedEmail.html ?? "";
	const html = sanitizeEmail(sourceHtml);
	const text = parsedEmail.text ?? html.replace(/<[^>]*>/g, " ");
	const sender = parsedEmail.from?.address ?? metadata.envelopeFrom;
	const senderName = parsedEmail.from?.name ?? "";
	return [
		metadata.messageId,
		metadata.mailboxId,
		metadata.threadId,
		metadata.dedupKey,
		readHeaderValue(parsedEmail.messageId, `<${metadata.messageId}@flaremail.local>`),
		readHeaderValue(parsedEmail.inReplyTo),
		JSON.stringify(readReferences(parsedEmail)),
		readHeaderValue(parsedEmail.subject),
		sender,
		senderName,
		JSON.stringify(readAddresses(parsedEmail.to)),
		JSON.stringify(readAddresses(parsedEmail.cc)),
		readReplyAddress(parsedEmail),
		text,
		html,
		text.replace(/\s+/g, " ").slice(0, 240),
		readReceivedAt(parsedEmail.date),
		metadata.rawBlobId,
	];
}

async function storeAttachments(
	database: Executor,
	mailboxId: string,
	messageId: string,
	parsedEmail: Email,
) {
	for (const attachment of parsedEmail.attachments) {
		const bytes =
			typeof attachment.content === "string"
				? new TextEncoder().encode(attachment.content)
				: new Uint8Array(attachment.content);
		const blob = await putBlob(database, mailboxId, bytes, {
			filename: attachment.filename ?? "attachment",
			contentType: attachment.mimeType,
			contentId: attachment.contentId?.replace(/^<|>$/g, ""),
		});
		await database.execute({
			sql: "INSERT INTO message_attachments (message_id,blob_id) VALUES (?,?)",
			args: [messageId, blob.id],
		});
	}
}

const findDuplicate = (database: Executor, mailboxId: string, dedupKey: string) =>
	findRecord(database, "SELECT id FROM messages WHERE mailbox_id=? AND dedup_key=?", [
		mailboxId,
		dedupKey,
	]);

export async function ingestEmail(
	database: Database,
	rawEmail: Uint8Array,
	envelope: { from: string; to: string },
) {
	if (rawEmail.length > MAX_MESSAGE_SIZE) {
		throw new AppError("VALIDATION", "Message exceeds the 5 MiB application limit.");
	}

	const mailbox = await findRecord(
		database,
		"SELECT b.* FROM mailboxes b JOIN domains d ON d.id=b.domain_id WHERE b.address=? AND b.disabled=0 AND d.ready=1",
		[envelope.to.toLowerCase()],
	);

	if (!mailbox) {
		throw new AppError("NOT_FOUND", "Recipient mailbox is not available.");
	}

	const mailboxId = readStringField(mailbox, "id");
	const dedupKey = await hashSha256(rawEmail);
	const duplicateMessage = await findDuplicate(database, mailboxId, dedupKey);

	if (duplicateMessage) {
		return { id: readStringField(duplicateMessage, "id"), duplicate: true };
	}

	const parsedEmail = await PostalMime.parse(rawEmail, { attachmentEncoding: "arraybuffer" });
	const messageId = crypto.randomUUID();

	try {
		await runInTransaction(database, async (transactionDatabase) => {
			if (await findDuplicate(transactionDatabase, mailboxId, dedupKey)) {
				return;
			}

			const headerMessageId = parsedEmail.messageId ?? "";
			const threadId = await resolveThreadId(
				transactionDatabase,
				mailboxId,
				readReferences(parsedEmail),
				messageId,
				headerMessageId,
			);
			const rawBlob = await putBlob(transactionDatabase, mailboxId, rawEmail, {
				filename: "message.eml",
				contentType: "message/rfc822",
			});
			const values = buildMessageValues(parsedEmail, {
				messageId,
				mailboxId,
				threadId,
				dedupKey,
				rawBlobId: rawBlob.id,
				envelopeFrom: envelope.from,
			});
			await transactionDatabase.execute({
				sql: "INSERT INTO messages (id,mailbox_id,thread_id,dedup_key,message_id,in_reply_to,references_json,subject,sender,sender_name,to_json,cc_json,reply_to,text,html,snippet,received_at,raw_blob_id,direction,folder,unread) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'inbound','inbox',1)",
				args: values,
			});
			await storeAttachments(transactionDatabase, mailboxId, messageId, parsedEmail);
		});
	} catch (error) {
		const existingMessage = await findDuplicate(database, mailboxId, dedupKey);

		if (existingMessage) {
			return { id: readStringField(existingMessage, "id"), duplicate: true };
		}

		throw error;
	}

	const storedMessage = await findDuplicate(database, mailboxId, dedupKey);
	const storedMessageId = readStringField(storedMessage!, "id");
	return { id: storedMessageId, duplicate: storedMessageId !== messageId };
}
