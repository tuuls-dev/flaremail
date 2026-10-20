/* eslint-disable no-await-in-loop -- Sequential transaction operations and bounded binary transfers must not execute concurrently. */
import { AppError, CHUNK_SIZE } from "@flaremail/contracts";
import type { Attachment, User, Params } from "@flaremail/contracts";
import type { Executor, Database } from "../../platform/database/client";
import {
	findRecord,
	readStringField,
	readNumberField,
	runInTransaction,
} from "../../platform/database/client";
import { requireMailbox } from "../mailboxes/index";

export async function putBlob(
	transactionDatabase: Executor,
	mailboxId: string,
	bytes: Uint8Array,
	metadata: { filename: string; contentType: string; contentId?: string },
): Promise<Attachment> {
	const id = crypto.randomUUID();
	await transactionDatabase.execute({
		sql: "INSERT INTO blobs (id,mailbox_id,filename,content_type,size,content_id,created_at) VALUES (?,?,?,?,?,?,?)",
		args: [
			id,
			mailboxId,
			metadata.filename,
			metadata.contentType,
			bytes.length,
			metadata.contentId ?? null,
			Date.now(),
		],
	});

	for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
		const chunkEnd = offset + CHUNK_SIZE;
		await transactionDatabase.execute({
			sql: "INSERT INTO blob_chunks (blob_id,chunk_index,bytes) VALUES (?,?,?)",
			args: [id, offset / CHUNK_SIZE, bytes.slice(offset, chunkEnd)],
		});
	}

	return {
		id,
		filename: metadata.filename,
		contentType: metadata.contentType,
		size: bytes.length,
		contentId: metadata.contentId ?? null,
	};
}

export function mapAttachmentRecord(record: import("@libsql/client").Row): Attachment {
	return {
		id: readStringField(record, "id"),
		filename: readStringField(record, "filename"),
		contentType: readStringField(record, "content_type"),
		size: readNumberField(record, "size"),
		contentId: record.content_id ? readStringField(record, "content_id") : null,
	};
}

export async function readBlob(database: Executor, id: string): Promise<Uint8Array> {
	const blob = await findRecord(database, "SELECT size FROM blobs WHERE id=?", [id]);

	if (!blob) {
		throw new AppError("NOT_FOUND", "Attachment not found.");
	}

	const size = readNumberField(blob, "size");
	const bytes = new Uint8Array(size);

	for (let offset = 0; offset < size; offset += CHUNK_SIZE) {
		const chunk = await findRecord(
			database,
			"SELECT bytes FROM blob_chunks WHERE blob_id=? AND chunk_index=?",
			[id, offset / CHUNK_SIZE],
		);

		if (!chunk?.bytes || !(chunk.bytes instanceof ArrayBuffer)) {
			throw new AppError("CONFLICT", "This attachment has not finished uploading.");
		}

		const content = new Uint8Array(chunk.bytes);

		const remainingSize = size - offset;

		if (content.length !== Math.min(CHUNK_SIZE, remainingSize)) {
			throw new AppError("CONFLICT", "Attachment is incomplete.");
		}

		bytes.set(content, offset);
	}

	return bytes;
}

export async function beginUpload(
	database: Database,
	user: User | null,
	input: Params<"attachments.begin">,
) {
	await requireMailbox(database, user, input.mailboxId);
	const draft = await findRecord(
		database,
		"SELECT id FROM drafts WHERE id=? AND mailbox_id=? AND author_id=?",
		[input.draftId, input.mailboxId, user!.id],
	);

	if (!draft) {
		throw new AppError("NOT_FOUND", "Save the draft before adding attachments.");
	}

	const id = crypto.randomUUID();
	await database.execute({
		sql: "INSERT INTO blobs (id,mailbox_id,owner_id,draft_id,filename,content_type,size,created_at) VALUES (?,?,?,?,?,?,?,?)",
		args: [
			id,
			input.mailboxId,
			user!.id,
			input.draftId,
			input.filename,
			input.contentType,
			input.size,
			Date.now(),
		],
	});
	return {
		id,
		filename: input.filename,
		contentType: input.contentType,
		size: input.size,
		contentId: null,
	};
}

export async function uploadChunk(
	database: Database,
	user: User | null,
	input: Params<"attachments.upload">,
) {
	await requireMailbox(database, user, input.mailboxId);
	await runInTransaction(database, async (transactionDatabase) => {
		const blob = await findRecord(
			transactionDatabase,
			"SELECT b.* FROM blobs b JOIN drafts d ON d.id=b.draft_id WHERE b.id=? AND b.mailbox_id=? AND b.owner_id=? AND d.author_id=? AND NOT EXISTS (SELECT 1 FROM json_each(d.attachment_ids) j WHERE j.value=b.id) AND NOT EXISTS (SELECT 1 FROM send_attempts s WHERE s.draft_id=d.id AND s.status IN ('pending','sent','unknown'))",
			[input.id, input.mailboxId, user!.id, user!.id],
		);

		if (!blob) {
			throw new AppError(
				"NOT_FOUND",
				"Upload not found, attachment is already finalized, or draft is sending.",
			);
		}

		const bytesRemaining = readNumberField(blob, "size") - input.index * CHUNK_SIZE;
		const expected = Math.min(CHUNK_SIZE, bytesRemaining);

		if (input.bytes.length !== expected || expected <= 0) {
			throw new AppError("VALIDATION", "Unexpected attachment chunk size.");
		}

		await transactionDatabase.execute({
			sql: "INSERT INTO blob_chunks (blob_id,chunk_index,bytes) VALUES (?,?,?) ON CONFLICT(blob_id,chunk_index) DO UPDATE SET bytes=excluded.bytes",
			args: [input.id, input.index, input.bytes],
		});
	});
	return { ok: true as const };
}

export async function downloadChunk(
	database: Database,
	user: User | null,
	input: Params<"attachments.chunk">,
) {
	await requireMailbox(database, user, input.mailboxId);
	const blob = await findRecord(
		database,
		`SELECT b.* FROM blobs b WHERE b.id=? AND b.mailbox_id=? AND (EXISTS (SELECT 1 FROM messages m WHERE m.mailbox_id=b.mailbox_id AND m.raw_blob_id=b.id) OR EXISTS (SELECT 1 FROM message_attachments ma JOIN messages m ON m.id=ma.message_id WHERE ma.blob_id=b.id AND m.mailbox_id=b.mailbox_id) OR (b.owner_id=? AND EXISTS (SELECT 1 FROM drafts d WHERE d.id=b.draft_id AND d.author_id=?)))`,
		[input.blobId, input.mailboxId, user!.id, user!.id],
	);

	if (!blob) {
		throw new AppError("NOT_FOUND", "Attachment not found.");
	}

	const size = readNumberField(blob, "size");

	if (input.index * CHUNK_SIZE >= size && size !== 0) {
		throw new AppError("NOT_FOUND", "Chunk not found.");
	}

	const chunk = await findRecord(
		database,
		"SELECT bytes FROM blob_chunks WHERE blob_id=? AND chunk_index=?",
		[input.blobId, input.index],
	);
	const bytes =
		chunk?.bytes instanceof ArrayBuffer ? new Uint8Array(chunk.bytes) : new Uint8Array();
	return {
		bytes,
		size,
		filename: readStringField(blob, "filename"),
		contentType: readStringField(blob, "content_type"),
	};
}

export async function copyAttachment(
	database: Database,
	user: User | null,
	params: Params<"attachments.copy">,
) {
	await requireMailbox(database, user, params.mailboxId);
	return runInTransaction(database, async (transactionDatabase) => {
		const draft = await findRecord(
			transactionDatabase,
			"SELECT id FROM drafts WHERE id=? AND mailbox_id=? AND author_id=?",
			[params.draftId, params.mailboxId, user!.id],
		);

		if (!draft) {
			throw new AppError("NOT_FOUND", "Draft not found.");
		}

		const activeSend = await findRecord(
			transactionDatabase,
			"SELECT status FROM send_attempts WHERE draft_id=? AND status IN ('pending','sent','unknown')",
			[params.draftId],
		);

		if (activeSend) {
			throw new AppError("CONFLICT", "This draft is already sending.");
		}

		const attachment = await findRecord(
			transactionDatabase,
			"SELECT b.* FROM blobs b JOIN message_attachments a ON a.blob_id=b.id JOIN messages m ON m.id=a.message_id WHERE b.id=? AND m.mailbox_id=? LIMIT 1",
			[params.attachmentId, params.mailboxId],
		);

		if (!attachment) {
			throw new AppError("NOT_FOUND", "Original attachment not found.");
		}

		const attachmentId = crypto.randomUUID();
		await transactionDatabase.execute({
			sql: "INSERT INTO blobs (id,mailbox_id,owner_id,draft_id,filename,content_type,size,content_id,created_at) SELECT ?,mailbox_id,?,?,filename,content_type,size,content_id,? FROM blobs WHERE id=?",
			args: [attachmentId, user!.id, params.draftId, Date.now(), params.attachmentId],
		});
		await transactionDatabase.execute({
			sql: "INSERT INTO blob_chunks (blob_id,chunk_index,bytes) SELECT ?,chunk_index,bytes FROM blob_chunks WHERE blob_id=?",
			args: [attachmentId, params.attachmentId],
		});
		return Object.assign(mapAttachmentRecord(attachment), { id: attachmentId });
	});
}
