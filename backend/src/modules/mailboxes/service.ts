import { AppError } from "@flaremail/contracts";
import type { User, Params } from "@flaremail/contracts";
import { findRecord, readStringField, runInTransaction } from "../../platform/database/client";
import type { Database } from "../../platform/database/client";
import { requireOrgAdmin } from "../organizations/index";
import { requireMailboxAdmin } from "./policy";
import { mapMailboxRecord } from "./repository";
import { recordAuditEvent } from "../audit/index";

export async function listMailboxes(database: Database, orgId: string) {
	const result = await database.execute({
		sql: "SELECT * FROM mailboxes WHERE org_id=? ORDER BY name",
		args: [orgId],
	});
	return result.rows.map(mapMailboxRecord);
}

export async function createMailbox(
	database: Database,
	user: User | null,
	input: Params<"mailboxes.create">,
) {
	const actor = await requireOrgAdmin(database, user, input.orgId);
	const domain = await findRecord(database, "SELECT name FROM domains WHERE id=? AND org_id=?", [
		input.domainId,
		input.orgId,
	]);

	if (!domain) {
		throw new AppError("NOT_FOUND", "Choose a domain in this organization.");
	}

	const mailbox = {
		id: crypto.randomUUID(),
		orgId: input.orgId,
		name: input.name,
		address: `${input.localPart}@${domain.name}`,
		disabled: false,
	};
	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "INSERT INTO mailboxes (id,org_id,domain_id,address,name) VALUES (?,?,?,?,?)",
			args: [mailbox.id, input.orgId, input.domainId, mailbox.address, input.name],
		});
		await recordAuditEvent(
			transactionDatabase,
			actor.id,
			input.orgId,
			"mailbox.create",
			mailbox.address,
		);
	});
	return mailbox;
}

export async function updateMailbox(
	database: Database,
	user: User | null,
	input: Params<"mailboxes.update">,
) {
	const mailbox = await requireMailboxAdmin(database, user, input.mailboxId);
	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "UPDATE mailboxes SET name=?,disabled=? WHERE id=?",
			args: [input.name, input.disabled ? 1 : 0, input.mailboxId],
		});
		await recordAuditEvent(
			transactionDatabase,
			user!.id,
			mailbox.orgId,
			"mailbox.update",
			mailbox.address,
		);
	});
	return { ok: true as const };
}

export async function listMailboxGrants(database: Database, user: User | null, mailboxId: string) {
	await requireMailboxAdmin(database, user, mailboxId);
	const result = await database.execute({
		sql: "SELECT u.id,u.name,u.email FROM mailbox_grants g JOIN users u ON u.id=g.user_id WHERE g.mailbox_id=? ORDER BY u.name",
		args: [mailboxId],
	});
	return result.rows.map((record) => ({
		id: readStringField(record, "id"),
		name: readStringField(record, "name"),
		email: readStringField(record, "email"),
	}));
}

export async function setGrant(
	database: Database,
	user: User | null,
	input: Params<"mailboxes.grant">,
	remove: boolean,
) {
	const mailbox = await requireMailboxAdmin(database, user, input.mailboxId);
	await runInTransaction(database, async (transactionDatabase) => {
		if (
			!remove &&
			!(await findRecord(
				transactionDatabase,
				"SELECT user_id FROM memberships WHERE org_id=? AND user_id=? AND disabled=0",
				[mailbox.orgId, input.userId],
			))
		) {
			throw new AppError("VALIDATION", "Add this user as an active organization member first.");
		}

		const sql = remove
			? "DELETE FROM mailbox_grants WHERE mailbox_id=? AND user_id=?"
			: "INSERT OR IGNORE INTO mailbox_grants (mailbox_id,user_id) VALUES (?,?)";
		await transactionDatabase.execute({ sql, args: [input.mailboxId, input.userId] });
		const auditAction = remove ? "mailbox.revoke" : "mailbox.grant";
		await recordAuditEvent(
			transactionDatabase,
			user!.id,
			mailbox.orgId,
			auditAction,
			`${input.mailboxId}:${input.userId}`,
		);
	});
	return { ok: true as const };
}
