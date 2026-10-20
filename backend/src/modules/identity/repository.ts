import type { Row } from "@libsql/client";
import type { User } from "@flaremail/contracts";
import { readNumberField, readStringField, findRecord } from "../../platform/database/client";
import type { Executor } from "../../platform/database/client";

export function mapUserRecord(record: Row): User {
	return {
		id: readStringField(record, "id"),
		email: readStringField(record, "email"),
		name: readStringField(record, "name"),
		instanceAdmin: Boolean(readNumberField(record, "instance_admin")),
		mustChangePassword: Boolean(readNumberField(record, "must_change_password")),
		disabled: Boolean(readNumberField(record, "disabled")),
	};
}

export const findUserByEmail = (database: Executor, email: string) =>
	findRecord(database, "SELECT * FROM users WHERE email = ?", [email]);
export const findUser = (database: Executor, id: string) =>
	findRecord(database, "SELECT * FROM users WHERE id = ?", [id]);
export const findSession = (database: Executor, hash: string) =>
	findRecord(
		database,
		"SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0",
		[hash, Date.now()],
	);
