import { AppError } from "@flaremail/contracts";
import type { User } from "@flaremail/contracts";
import { requireUser } from "../identity/index";
import { requireOrgAdmin } from "../organizations/index";
import { findRecord, readStringField } from "../../platform/database/client";
import type { Executor } from "../../platform/database/client";
import { mapMailboxRecord } from "./repository";

export async function requireMailbox(database: Executor, user: User | null, mailboxId: string) {
	requireUser(user);
	const record = await findRecord(
		database,
		`SELECT b.* FROM mailboxes b JOIN mailbox_grants g ON g.mailbox_id=b.id JOIN memberships m ON m.org_id=b.org_id AND m.user_id=g.user_id WHERE b.id=? AND g.user_id=? AND b.disabled=0 AND m.disabled=0`,
		[mailboxId, user.id],
	);

	if (!record) {
		throw new AppError("FORBIDDEN", "You do not have access to this mailbox.");
	}

	return mapMailboxRecord(record);
}

export async function requireMailboxAdmin(
	database: Executor,
	user: User | null,
	mailboxId: string,
) {
	const record = await findRecord(database, "SELECT * FROM mailboxes WHERE id=?", [mailboxId]);

	if (!record) {
		throw new AppError("NOT_FOUND", "Mailbox not found.");
	}

	await requireOrgAdmin(database, user, readStringField(record, "org_id"));
	return mapMailboxRecord(record);
}
