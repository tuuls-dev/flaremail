/* eslint-disable no-await-in-loop -- Sequential transaction operations and bounded binary transfers must not execute concurrently. */
import { AppError } from "@flaremail/contracts";
import type { Draft, User, Params } from "@flaremail/contracts";
import type { Row } from "@libsql/client";
import {
	findRecord,
	readStringField,
	readNumberField,
	parseJsonField,
	runInTransaction,
} from "../../platform/database/client";
import type { Database, Executor } from "../../platform/database/client";
import { requireMailbox } from "../mailboxes/index";
import { sanitizeEmail } from "../../platform/email/sanitize";

export function mapDraftRecord(record: Row): Draft {
	const status = readStringField(record, "send_status");
	const sendStatus = ["pending", "sent", "failed", "unknown"].includes(status)
		? (status as NonNullable<Draft["sendStatus"]>)
		: null;
	return {
		id: readStringField(record, "id"),
		mailboxId: readStringField(record, "mailbox_id"),
		version: readNumberField(record, "version"),
		to: parseJsonField<string[]>(record, "to_json"),
		cc: parseJsonField<string[]>(record, "cc_json"),
		bcc: parseJsonField<string[]>(record, "bcc_json"),
		subject: readStringField(record, "subject"),
		html: readStringField(record, "html"),
		text: readStringField(record, "text"),
		replyToMessageId: record.reply_to_message_id
			? readStringField(record, "reply_to_message_id")
			: null,
		attachmentIds: parseJsonField<string[]>(record, "attachment_ids"),
		updatedAt: readNumberField(record, "updated_at"),
		sendStatus,
		sendError: record.send_error ? readStringField(record, "send_error") : null,
	};
}

const draftSelect = `SELECT d.*,(SELECT status FROM send_attempts s WHERE s.draft_id=d.id ORDER BY created_at DESC LIMIT 1) AS send_status,(SELECT error FROM send_attempts s WHERE s.draft_id=d.id ORDER BY created_at DESC LIMIT 1) AS send_error FROM drafts d`;
export const findDraft = (database: Executor, id: string, mailboxId: string, userId: string) =>
	findRecord(database, `${draftSelect} WHERE d.id=? AND d.mailbox_id=? AND d.author_id=?`, [
		id,
		mailboxId,
		userId,
	]);

export async function getDraft(database: Database, user: User | null, input: Params<"drafts.get">) {
	await requireMailbox(database, user, input.mailboxId);
	const record = await findDraft(database, input.id, input.mailboxId, user!.id);

	if (!record) {
		throw new AppError("NOT_FOUND", "Draft not found.");
	}

	return mapDraftRecord(record);
}

export async function listDrafts(database: Database, user: User | null, mailboxId: string) {
	await requireMailbox(database, user, mailboxId);
	const result = await database.execute({
		sql: `${draftSelect} WHERE d.mailbox_id=? AND d.author_id=? ORDER BY d.updated_at DESC LIMIT 200`,
		args: [mailboxId, user!.id],
	});
	return result.rows.map(mapDraftRecord);
}

export async function assertDraftEditable(database: Executor, id: string) {
	const active = await findRecord(
		database,
		"SELECT status FROM send_attempts WHERE draft_id=? AND status IN ('pending','sent','unknown') LIMIT 1",
		[id],
	);

	if (active) {
		throw new AppError(
			"CONFLICT",
			"This draft is sending or has an uncertain send outcome. Do not resend it.",
		);
	}
}

export async function saveDraft(
	database: Database,
	user: User | null,
	input: Params<"drafts.save">,
) {
	await requireMailbox(database, user, input.mailboxId);
	await runInTransaction(database, async (transactionDatabase) => {
		await assertDraftEditable(transactionDatabase, input.id);

		for (const blobId of input.attachmentIds) {
			const blob = await findRecord(
				transactionDatabase,
				"SELECT id FROM blobs WHERE id=? AND mailbox_id=? AND owner_id=? AND draft_id=?",
				[blobId, input.mailboxId, user!.id, input.id],
			);

			if (!blob) {
				throw new AppError("VALIDATION", "An attachment does not belong to this draft.");
			}
		}

		const values = [
			JSON.stringify(input.to),
			JSON.stringify(input.cc),
			JSON.stringify(input.bcc),
			input.subject,
			sanitizeEmail(input.html),
			input.text,
			input.replyToMessageId,
			JSON.stringify(input.attachmentIds),
			Date.now(),
		];

		if (input.version === 0) {
			if (await findRecord(transactionDatabase, "SELECT id FROM drafts WHERE id=?", [input.id])) {
				throw new AppError(
					"CONFLICT",
					"This draft was updated elsewhere. Reopen it before editing.",
				);
			}

			await transactionDatabase.execute({
				sql: "INSERT INTO drafts (to_json,cc_json,bcc_json,subject,html,text,reply_to_message_id,attachment_ids,updated_at,id,mailbox_id,author_id,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)",
				args: values.concat(input.id, input.mailboxId, user!.id),
			});
		} else {
			const result = await transactionDatabase.execute({
				sql: "UPDATE drafts SET to_json=?,cc_json=?,bcc_json=?,subject=?,html=?,text=?,reply_to_message_id=?,attachment_ids=?,updated_at=?,version=version+1 WHERE id=? AND mailbox_id=? AND author_id=? AND version=?",
				args: values.concat(input.id, input.mailboxId, user!.id, input.version),
			});

			if (!result.rowsAffected) {
				throw new AppError(
					"CONFLICT",
					"This draft changed in another tab. Reopen it before editing.",
				);
			}
		}
	});
	return getDraft(database, user, { id: input.id, mailboxId: input.mailboxId });
}

export async function discardDraft(
	database: Database,
	user: User | null,
	input: Params<"drafts.discard">,
) {
	await requireMailbox(database, user, input.mailboxId);
	await runInTransaction(database, async (transactionDatabase) => {
		await assertDraftEditable(transactionDatabase, input.id);
		const result = await transactionDatabase.execute({
			sql: "DELETE FROM drafts WHERE id=? AND mailbox_id=? AND author_id=? AND version=?",
			args: [input.id, input.mailboxId, user!.id, input.version],
		});

		const retainedDraft = result.rowsAffected
			? null
			: await findDraft(transactionDatabase, input.id, input.mailboxId, user!.id);
		const hasVersionConflict = retainedDraft || input.version !== 0;

		if (!result.rowsAffected && hasVersionConflict) {
			throw new AppError("CONFLICT", "This draft changed elsewhere. Reopen it before discarding.");
		}
	});
	return { ok: true as const };
}
