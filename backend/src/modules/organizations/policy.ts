import { AppError } from "@flaremail/contracts";
import type { User } from "@flaremail/contracts";
import { requireUser } from "../identity/index";
import { findRecord } from "../../platform/database/client";
import type { Executor } from "../../platform/database/client";

export async function requireOrgAdmin(database: Executor, user: User | null, orgId: string) {
	requireUser(user);
	const organization = await findRecord(database, "SELECT id FROM organizations WHERE id=?", [
		orgId,
	]);

	if (!organization) {
		throw new AppError("NOT_FOUND", "Organization not found.");
	}

	if (user.instanceAdmin) {
		return user;
	}

	const member = await findRecord(
		database,
		"SELECT role FROM memberships WHERE org_id=? AND user_id=? AND disabled=0",
		[orgId, user.id],
	);

	if (member?.role !== "admin") {
		throw new AppError("FORBIDDEN", "Organization administrator access is required.");
	}

	return user;
}
