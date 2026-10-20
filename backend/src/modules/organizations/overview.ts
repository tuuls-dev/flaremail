import type { User } from "@flaremail/contracts";
import { readStringField, readNumberField } from "../../platform/database/client";
import type { Database } from "../../platform/database/client";
import { requireOrgAdmin } from "./policy";
import { listMembers } from "./service";
import { listDomains } from "../domains/index";
import { listMailboxes } from "../mailboxes/index";

export async function readOrganizationOverview(
	database: Database,
	user: User | null,
	orgId: string,
) {
	await requireOrgAdmin(database, user, orgId);
	const [domains, members, mailboxes, events] = await Promise.all([
		listDomains(database, orgId),
		listMembers(database, orgId),
		listMailboxes(database, orgId),
		database.execute({
			sql: "SELECT a.*,u.name AS actor FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.org_id=? ORDER BY a.created_at DESC LIMIT 50",
			args: [orgId],
		}),
	]);
	return {
		domains,
		members,
		mailboxes,
		audit: events.rows.map((record) => ({
			id: readStringField(record, "id"),
			actor: readStringField(record, "actor"),
			action: readStringField(record, "action"),
			target: readStringField(record, "target"),
			createdAt: readNumberField(record, "created_at"),
		})),
	};
}
