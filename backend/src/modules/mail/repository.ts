import type { Row, InValue } from "@libsql/client";
import type { Message, MessageSummary, Label, Params } from "@flaremail/contracts";
import { parseJsonField, readStringField, readNumberField } from "../../platform/database/client";
import type { Executor } from "../../platform/database/client";
import { mapAttachmentRecord } from "./blobs";

export function buildListFilter(input: Params<"mail.list">) {
	const clauses = ["m.mailbox_id=?"];
	const args: InValue[] = [input.mailboxId];
	const folders: Record<string, string> = {
		inbox: "m.folder='inbox'",
		starred: "m.starred=1 AND m.folder<>'trash'",
		sent: "m.direction='outbound' AND m.folder<>'trash'",
		archive: "m.folder='archive'",
		trash: "m.folder='trash'",
		all: "m.folder<>'trash'",
	};
	clauses.push(folders[input.folder]);

	if (input.search) {
		clauses.push(
			"(m.subject LIKE ? ESCAPE '\\' OR m.sender LIKE ? ESCAPE '\\' OR m.sender_name LIKE ? ESCAPE '\\' OR m.to_json LIKE ? ESCAPE '\\' OR m.cc_json LIKE ? ESCAPE '\\' OR m.text LIKE ? ESCAPE '\\')",
		);
		const term = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
		args.push(term, term, term, term, term, term);
	}

	if (input.labelId) {
		clauses.push(
			"EXISTS (SELECT 1 FROM message_labels ml WHERE ml.message_id=m.id AND ml.label_id=?)",
		);
		args.push(input.labelId);
	}

	return { where: clauses.join(" AND "), args };
}

export async function listThreadLabels(
	database: Executor,
	mailboxId: string,
	threadId: string,
): Promise<Label[]> {
	const listLabels = await database.execute({
		sql: "SELECT DISTINCT l.* FROM labels l JOIN message_labels ml ON ml.label_id=l.id JOIN messages m ON m.id=ml.message_id WHERE m.mailbox_id=? AND m.thread_id=? ORDER BY l.name",
		args: [mailboxId, threadId],
	});
	return listLabels.rows.map((record) => ({
		id: readStringField(record, "id"),
		name: readStringField(record, "name"),
		color: readStringField(record, "color"),
	}));
}

export async function mapSummaryRecord(database: Executor, record: Row): Promise<MessageSummary> {
	return {
		id: readStringField(record, "id"),
		threadId: readStringField(record, "thread_id"),
		subject: readStringField(record, "subject"),
		sender: readStringField(record, "sender"),
		senderName: readStringField(record, "sender_name"),
		snippet: readStringField(record, "snippet"),
		recipients: parseJsonField<string[]>(record, "to_json"),
		direction: record.direction === "outbound" ? "outbound" : "inbound",
		receivedAt: readNumberField(record, "received_at"),
		unread: Boolean(record.any_unread),
		starred: Boolean(record.any_starred),
		folder: readStringField(record, "folder"),
		attachmentCount: readNumberField(record, "attachment_count"),
		count: readNumberField(record, "thread_count"),
		labels: await listThreadLabels(
			database,
			readStringField(record, "mailbox_id"),
			readStringField(record, "thread_id"),
		),
	};
}

export async function mapMessageRecord(database: Executor, record: Row): Promise<Message> {
	const attachments = await database.execute({
		sql: "SELECT b.* FROM blobs b JOIN message_attachments a ON a.blob_id=b.id WHERE a.message_id=?",
		args: [readStringField(record, "id")],
	});
	return {
		id: readStringField(record, "id"),
		threadId: readStringField(record, "thread_id"),
		subject: readStringField(record, "subject"),
		sender: readStringField(record, "sender"),
		senderName: readStringField(record, "sender_name"),
		to: parseJsonField<string[]>(record, "to_json"),
		cc: parseJsonField<string[]>(record, "cc_json"),
		bcc: parseJsonField<string[]>(record, "bcc_json"),
		replyTo: readStringField(record, "reply_to"),
		text: readStringField(record, "text"),
		html: readStringField(record, "html"),
		receivedAt: readNumberField(record, "received_at"),
		direction: record.direction === "outbound" ? "outbound" : "inbound",
		messageId: readStringField(record, "message_id"),
		attachments: attachments.rows.map(mapAttachmentRecord),
		rawBlobId: record.raw_blob_id ? readStringField(record, "raw_blob_id") : null,
	};
}
