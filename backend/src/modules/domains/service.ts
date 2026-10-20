import { AppError } from "@flaremail/contracts";
import type { User } from "@flaremail/contracts";
import type { Row } from "@libsql/client";
import { findRecord, readStringField, runInTransaction } from "../../platform/database/client";
import type { Database } from "../../platform/database/client";
import { requireOrgAdmin } from "../organizations/index";
import { recordAuditEvent } from "../audit/index";

export function mapDomainRecord(record: Row) {
	return {
		id: readStringField(record, "id"),
		orgId: readStringField(record, "org_id"),
		name: readStringField(record, "name"),
		ready: Boolean(record.ready),
	};
}

export async function listDomains(database: Database, orgId: string) {
	const result = await database.execute({
		sql: "SELECT * FROM domains WHERE org_id=? ORDER BY name",
		args: [orgId],
	});
	return result.rows.map(mapDomainRecord);
}

export async function createDomain(
	database: Database,
	user: User | null,
	orgId: string,
	name: string,
) {
	const actor = await requireOrgAdmin(database, user, orgId);
	const id = crypto.randomUUID();
	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "INSERT INTO domains (id,org_id,name) VALUES (?,?,?)",
			args: [id, orgId, name],
		});
		await recordAuditEvent(transactionDatabase, actor.id, orgId, "domain.create", name);
	});
	return { id, orgId, name, ready: false };
}

export async function updateDomain(
	database: Database,
	user: User | null,
	input: { orgId: string; id: string; ready?: boolean },
	remove = false,
) {
	const actor = await requireOrgAdmin(database, user, input.orgId);
	await runInTransaction(database, async (transactionDatabase) => {
		const domain = await findRecord(
			transactionDatabase,
			"SELECT id FROM domains WHERE id=? AND org_id=?",
			[input.id, input.orgId],
		);

		if (!domain) {
			throw new AppError("NOT_FOUND", "Domain not found.");
		}

		if (remove) {
			if (
				await findRecord(
					transactionDatabase,
					"SELECT id FROM mailboxes WHERE domain_id=? LIMIT 1",
					[input.id],
				)
			) {
				throw new AppError(
					"CONFLICT",
					"This domain has mailboxes. Disable them to stop delivery; domains with retained mail cannot be removed.",
				);
			}

			await transactionDatabase.execute({
				sql: "DELETE FROM domains WHERE id=?",
				args: [input.id],
			});
		} else {
			await transactionDatabase.execute({
				sql: "UPDATE domains SET ready=? WHERE id=?",
				args: [input.ready ? 1 : 0, input.id],
			});
		}

		const auditAction = remove ? "domain.remove" : "domain.readiness";
		await recordAuditEvent(transactionDatabase, actor.id, input.orgId, auditAction, input.id);
	});
	return { ok: true as const };
}
