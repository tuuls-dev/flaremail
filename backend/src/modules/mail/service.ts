import { AppError } from "@flaremail/contracts";
import type { User, Params } from "@flaremail/contracts";
import type { InValue } from "@libsql/client";
import {
	findRecord,
	readStringField,
	readNumberField,
	runInTransaction,
} from "../../platform/database/client";
import type { Database } from "../../platform/database/client";
import { requireMailbox } from "../mailboxes/index";
import { buildListFilter, mapMessageRecord, mapSummaryRecord } from "./repository";

export async function listMail(database: Database, user: User | null, input: Params<"mail.list">) {
	await requireMailbox(database, user, input.mailboxId);
	const filter = buildListFilter(input);
	const offset = input.offset ?? 0;
	const result = await database.execute({
		sql: `WITH matching_threads AS (SELECT DISTINCT m.thread_id FROM messages m WHERE ${filter.where}), conversation_messages AS (SELECT m.* FROM messages m JOIN matching_threads mt ON mt.thread_id=m.thread_id WHERE m.mailbox_id=?), threads AS (SELECT thread_id,COUNT(*) AS thread_count,MAX(unread) AS any_unread,MAX(starred) AS any_starred FROM conversation_messages GROUP BY thread_id), ranked AS (SELECT f.*,ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY received_at DESC,id DESC) AS rank FROM conversation_messages f) SELECT r.*,t.thread_count,t.any_unread,t.any_starred,(SELECT COUNT(*) FROM message_attachments a JOIN messages am ON am.id=a.message_id WHERE am.thread_id=r.thread_id AND am.mailbox_id=r.mailbox_id) AS attachment_count FROM ranked r JOIN threads t ON t.thread_id=r.thread_id WHERE r.rank=1 ORDER BY r.received_at DESC,r.id DESC LIMIT 40 OFFSET ?`,
		args: filter.args.concat(input.mailboxId, offset),
	});
	const total = await findRecord(
		database,
		`SELECT COUNT(DISTINCT m.thread_id) AS count FROM messages m WHERE ${filter.where}`,
		filter.args,
	);
	return {
		items: await Promise.all(result.rows.map((record) => mapSummaryRecord(database, record))),
		total: readNumberField(total!, "count"),
	};
}

export async function readThread(
	database: Database,
	user: User | null,
	input: Params<"mail.thread">,
) {
	await requireMailbox(database, user, input.mailboxId);
	const result = await database.execute({
		sql: "SELECT * FROM messages WHERE mailbox_id=? AND thread_id=? ORDER BY received_at,id",
		args: [input.mailboxId, input.threadId],
	});

	if (!result.rows.length) {
		throw new AppError("NOT_FOUND", "Conversation not found.");
	}

	return Promise.all(result.rows.map((record) => mapMessageRecord(database, record)));
}

export async function countMailboxMessages(
	database: Database,
	user: User | null,
	mailboxId: string,
) {
	await requireMailbox(database, user, mailboxId);
	const result = await findRecord(
		database,
		`SELECT COUNT(DISTINCT CASE WHEN folder='inbox' THEN thread_id END) AS inbox,COUNT(DISTINCT CASE WHEN folder='inbox' AND unread=1 THEN thread_id END) AS unread,COUNT(DISTINCT CASE WHEN starred=1 AND folder<>'trash' THEN thread_id END) AS starred,COUNT(DISTINCT CASE WHEN direction='outbound' AND folder<>'trash' THEN thread_id END) AS sent,COUNT(DISTINCT CASE WHEN folder='trash' THEN thread_id END) AS trash FROM messages WHERE mailbox_id=?`,
		[mailboxId],
	);
	const drafts = await findRecord(
		database,
		"SELECT COUNT(*) AS count FROM drafts WHERE mailbox_id=? AND author_id=?",
		[mailboxId, user!.id],
	);
	return {
		inbox: readNumberField(result!, "inbox"),
		unread: readNumberField(result!, "unread"),
		starred: readNumberField(result!, "starred"),
		sent: readNumberField(result!, "sent"),
		trash: readNumberField(result!, "trash"),
		drafts: readNumberField(drafts!, "count"),
	};
}

export async function updateMail(
	database: Database,
	user: User | null,
	input: Params<"mail.update">,
) {
	await requireMailbox(database, user, input.mailboxId);
	const fields: string[] = [];
	const args: InValue[] = [];

	if (input.unread !== undefined) {
		fields.push("unread=?");
		const unreadValue = input.unread ? 1 : 0;
		args.push(unreadValue);
	}

	if (input.starred !== undefined) {
		fields.push("starred=?");
		const starredValue = input.starred ? 1 : 0;
		args.push(starredValue);
	}

	if (input.folder) {
		fields.push("folder=?");
		args.push(input.folder);
	}

	const previousFolders = await runInTransaction(database, async (transactionDatabase) => {
		if (!fields.length) {
			return [];
		}

		const targetSelector = `mailbox_id=? AND thread_id IN (${input.threadIds.map(() => "?").join(",")})`;
		const targetParameters = [input.mailboxId].concat(input.threadIds);
		const previous = input.folder
			? await transactionDatabase.execute({
					sql: `SELECT id,folder FROM messages WHERE ${targetSelector}`,
					args: targetParameters,
				})
			: { rows: [] };

		if (previous.rows.length > 10000) {
			throw new AppError(
				"VALIDATION",
				"Select fewer conversations to keep this action recoverable.",
			);
		}

		await transactionDatabase.execute({
			sql: `UPDATE messages SET ${fields.join(",")} WHERE ${targetSelector}`,
			args: args.concat(targetParameters),
		});
		return previous.rows.map((record) => ({
			id: readStringField(record, "id"),
			folder: readStringField(record, "folder") as "inbox" | "archive" | "trash" | "sent",
		}));
	});
	return { ok: true as const, previousFolders };
}

export async function listLabels(database: Database, user: User | null, mailboxId: string) {
	await requireMailbox(database, user, mailboxId);
	const result = await database.execute({
		sql: "SELECT * FROM labels WHERE mailbox_id=? ORDER BY name",
		args: [mailboxId],
	});
	return result.rows.map((record) => ({
		id: readStringField(record, "id"),
		name: readStringField(record, "name"),
		color: readStringField(record, "color"),
	}));
}

export async function createLabel(
	database: Database,
	user: User | null,
	input: Params<"labels.create">,
) {
	await requireMailbox(database, user, input.mailboxId);
	const label = { id: crypto.randomUUID(), name: input.name, color: input.color };
	await database.execute({
		sql: "INSERT INTO labels (id,mailbox_id,name,color) VALUES (?,?,?,?)",
		args: [label.id, input.mailboxId, input.name, input.color],
	});
	return label;
}

export async function removeLabel(
	database: Database,
	user: User | null,
	input: Params<"labels.remove">,
) {
	await requireMailbox(database, user, input.mailboxId);
	await database.execute({
		sql: "DELETE FROM labels WHERE id=? AND mailbox_id=?",
		args: [input.id, input.mailboxId],
	});
	return { ok: true as const };
}

export async function labelMail(
	database: Database,
	user: User | null,
	input: Params<"mail.label">,
) {
	await requireMailbox(database, user, input.mailboxId);
	await runInTransaction(database, async (transactionDatabase) => {
		if (
			!(await findRecord(transactionDatabase, "SELECT id FROM labels WHERE id=? AND mailbox_id=?", [
				input.labelId,
				input.mailboxId,
			]))
		) {
			throw new AppError("NOT_FOUND", "Label not found.");
		}

		const placeholders = input.threadIds.map(() => "?").join(",");
		const sql = input.remove
			? `DELETE FROM message_labels WHERE label_id=? AND message_id IN (SELECT id FROM messages WHERE mailbox_id=? AND thread_id IN (${placeholders}))`
			: `INSERT OR IGNORE INTO message_labels (label_id,message_id) SELECT ?,id FROM messages WHERE mailbox_id=? AND thread_id IN (${placeholders})`;
		await transactionDatabase.execute({
			sql,
			args: [input.labelId, input.mailboxId].concat(input.threadIds),
		});
	});
	return { ok: true as const };
}

export async function restoreMessageFolders(
	database: Database,
	user: User | null,
	params: Params<"mail.restoreFolders">,
) {
	await requireMailbox(database, user, params.mailboxId);
	const folders = ["inbox", "archive", "trash", "sent"] as const;
	const statements = folders.flatMap((folder) => {
		const messageIds = params.states
			.filter((state) => state.folder === folder)
			.map((state) => state.id);

		if (!messageIds.length) {
			return [];
		}

		return [
			{
				sql: `UPDATE messages SET folder=? WHERE mailbox_id=? AND id IN (${messageIds.map(() => "?").join(",")})`,
				args: [folder, params.mailboxId].concat(messageIds),
			},
		];
	});

	if (statements.length) {
		await database.batch(statements, "write");
	}

	return { ok: true as const };
}
