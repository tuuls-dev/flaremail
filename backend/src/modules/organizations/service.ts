import { AppError } from "@flaremail/contracts";
import type { User, Organization, Member } from "@flaremail/contracts";
import {
	findRecord,
	readStringField,
	readNumberField,
	runInTransaction,
} from "../../platform/database/client";
import type { Database } from "../../platform/database/client";
import { requireInstanceAdmin, requireUser } from "../identity/index";
import { findUser, findUserByEmail } from "../identity/index";
import { requireOrgAdmin } from "./policy";
import { recordAuditEvent } from "../audit/index";
import { hashPassword } from "../../platform/security/password";
import { mapMailboxRecord } from "../mailboxes/index";

export async function listWorkspace(database: Database, user: User | null) {
	requireUser(user);
	const orgSql = user.instanceAdmin
		? "SELECT o.*, 'admin' AS role FROM organizations o ORDER BY o.name"
		: "SELECT o.*,m.role FROM organizations o JOIN memberships m ON m.org_id=o.id WHERE m.user_id=? AND m.disabled=0 ORDER BY o.name";
	const orgs = await database.execute({ sql: orgSql, args: user.instanceAdmin ? [] : [user.id] });
	const boxes = await database.execute({
		sql: "SELECT b.* FROM mailboxes b JOIN mailbox_grants g ON g.mailbox_id=b.id JOIN memberships m ON m.org_id=b.org_id AND m.user_id=g.user_id WHERE g.user_id=? AND m.disabled=0 AND b.disabled=0 ORDER BY b.name",
		args: [user.id],
	});
	const organizations: Organization[] = orgs.rows.map((record) => ({
		id: readStringField(record, "id"),
		name: readStringField(record, "name"),
		role: record.role === "admin" ? "admin" : "member",
	}));
	return { organizations, mailboxes: boxes.rows.map(mapMailboxRecord) };
}

export async function createOrganization(database: Database, user: User | null, name: string) {
	requireInstanceAdmin(user);
	const id = crypto.randomUUID();
	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "INSERT INTO organizations (id,name,created_at) VALUES (?,?,?)",
			args: [id, name, Date.now()],
		});
		await transactionDatabase.execute({
			sql: "INSERT INTO memberships (org_id,user_id,role) VALUES (?,?,'admin')",
			args: [id, user.id],
		});
		await recordAuditEvent(transactionDatabase, user.id, id, "organization.create", name);
	});
	return { id, name, role: "admin" as const };
}

export async function renameOrganization(
	database: Database,
	user: User | null,
	orgId: string,
	name: string,
) {
	const actor = await requireOrgAdmin(database, user, orgId);
	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "UPDATE organizations SET name=? WHERE id=?",
			args: [name, orgId],
		});
		await recordAuditEvent(transactionDatabase, actor.id, orgId, "organization.rename", name);
	});
	return { ok: true as const };
}

export async function listMembers(database: Database, orgId: string): Promise<Member[]> {
	const result = await database.execute({
		sql: "SELECT u.*,m.role,m.disabled AS membership_disabled FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=? ORDER BY u.name",
		args: [orgId],
	});
	return result.rows.map((record) => ({
		id: readStringField(record, "id"),
		name: readStringField(record, "name"),
		email: readStringField(record, "email"),
		role: record.role === "admin" ? "admin" : "member",
		disabled: Boolean(record.disabled) || Boolean(record.membership_disabled),
		instanceAdmin: Boolean(record.instance_admin),
	}));
}

export async function createMember(
	database: Database,
	user: User | null,
	input: { orgId: string; name: string; email: string; password: string; role: "admin" | "member" },
) {
	const actor = await requireOrgAdmin(database, user, input.orgId);

	if (await findUserByEmail(database, input.email)) {
		throw new AppError(
			"CONFLICT",
			"An account with this email already exists. Add it as an existing user.",
		);
	}

	const hash = await hashPassword(input.password);
	const id = crypto.randomUUID();
	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)",
			args: [id, input.email, input.name, hash, Date.now()],
		});
		await transactionDatabase.execute({
			sql: "INSERT INTO memberships (org_id,user_id,role) VALUES (?,?,?)",
			args: [input.orgId, id, input.role],
		});
		await recordAuditEvent(transactionDatabase, actor.id, input.orgId, "member.create", id);
	});
	return { ok: true as const };
}

export async function addMember(
	database: Database,
	user: User | null,
	input: { orgId: string; email: string; role: "admin" | "member" },
) {
	const actor = await requireOrgAdmin(database, user, input.orgId);
	const target = await findUserByEmail(database, input.email);

	if (!target) {
		throw new AppError("NOT_FOUND", "No account has this email. Create a new user instead.");
	}

	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "INSERT INTO memberships (org_id,user_id,role) VALUES (?,?,?)",
			args: [input.orgId, readStringField(target, "id"), input.role],
		});
		await recordAuditEvent(
			transactionDatabase,
			actor.id,
			input.orgId,
			"member.add",
			readStringField(target, "id"),
		);
	});
	return { ok: true as const };
}

export async function changeMember(
	database: Database,
	user: User | null,
	input: { orgId: string; userId: string; role?: "admin" | "member"; disabled?: boolean },
	action: "role" | "disable" | "remove",
) {
	const actor = await requireOrgAdmin(database, user, input.orgId);
	await runInTransaction(database, async (transactionDatabase) => {
		const member = await findRecord(
			transactionDatabase,
			"SELECT m.*,u.instance_admin FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=? AND m.user_id=?",
			[input.orgId, input.userId],
		);

		if (!member) {
			throw new AppError("NOT_FOUND", "Member not found.");
		}

		if (Boolean(member.instance_admin) && !actor.instanceAdmin) {
			throw new AppError("FORBIDDEN", "Only an instance admin can change this account.");
		}

		const currentlyAdmin = member.role === "admin";
		await preserveOrganizationAdmin(transactionDatabase, input, action, currentlyAdmin);

		const statements = {
			role: {
				sql: "UPDATE memberships SET role=? WHERE org_id=? AND user_id=?",
				args: [input.role ?? "member", input.orgId, input.userId],
			},
			disable: {
				sql: "UPDATE memberships SET disabled=? WHERE org_id=? AND user_id=?",
				args: [input.disabled ? 1 : 0, input.orgId, input.userId],
			},
			remove: {
				sql: "DELETE FROM memberships WHERE org_id=? AND user_id=?",
				args: [input.orgId, input.userId],
			},
		};
		await transactionDatabase.execute(statements[action]);

		if (action === "remove") {
			await transactionDatabase.execute({
				sql: "DELETE FROM mailbox_grants WHERE user_id=? AND mailbox_id IN (SELECT id FROM mailboxes WHERE org_id=?)",
				args: [input.userId, input.orgId],
			});
		}

		await recordAuditEvent(
			transactionDatabase,
			actor.id,
			input.orgId,
			`member.${action}`,
			input.userId,
		);
	});
	return { ok: true as const };
}

export async function resetPassword(
	database: Database,
	user: User | null,
	input: { orgId: string; userId: string; password: string },
) {
	const actor = await requireOrgAdmin(database, user, input.orgId);
	// Global credentials affect all orgs: delegated admins may reset only single-org, non-admin identities.
	const target = await findUser(database, input.userId);
	const memberships = await findRecord(
		database,
		"SELECT COUNT(*) AS count FROM memberships WHERE user_id=?",
		[input.userId],
	);
	const member = await findRecord(
		database,
		"SELECT user_id FROM memberships WHERE org_id=? AND user_id=?",
		[input.orgId, input.userId],
	);

	if (!target || !member) {
		throw new AppError("NOT_FOUND", "Member not found.");
	}

	if (
		!actor.instanceAdmin &&
		(Boolean(target.instance_admin) || readNumberField(memberships!, "count") > 1)
	) {
		throw new AppError(
			"FORBIDDEN",
			"An instance admin must reset credentials shared across organizations.",
		);
	}

	const hash = await hashPassword(input.password);
	await runInTransaction(database, async (transactionDatabase) => {
		await transactionDatabase.execute({
			sql: "UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?",
			args: [hash, input.userId],
		});
		await transactionDatabase.execute({
			sql: "DELETE FROM sessions WHERE user_id=?",
			args: [input.userId],
		});
		await recordAuditEvent(
			transactionDatabase,
			actor.id,
			input.orgId,
			"member.passwordReset",
			input.userId,
		);
	});
	return { ok: true as const };
}

async function preserveOrganizationAdmin(
	transactionDatabase: import("../../platform/database/client").Executor,
	input: { orgId: string; userId: string; role?: string; disabled?: boolean },
	action: string,
	currentlyAdmin: boolean,
) {
	const isDisabling = action === "disable" && input.disabled === true;
	const isDemoting = action === "role" && input.role === "member";
	const lowering = action === "remove" || isDisabling || isDemoting;

	if (currentlyAdmin && lowering) {
		const count = await findRecord(
			transactionDatabase,
			"SELECT COUNT(*) AS count FROM memberships WHERE org_id=? AND role='admin' AND disabled=0 AND user_id<>?",
			[input.orgId, input.userId],
		);

		if (readNumberField(count!, "count") === 0) {
			throw new AppError("CONFLICT", "Keep at least one active organization administrator.");
		}
	}
}
