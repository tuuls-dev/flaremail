import { AppError } from "@flaremail/contracts";
import type { Params, Session } from "@flaremail/contracts";
import { findRecord, readStringField, runInTransaction } from "../../platform/database/client";
import type { Database } from "../../platform/database/client";
import {
	hashPassword,
	encodeHex,
	hashSha256,
	verifyPassword,
} from "../../platform/security/password";
import { findSession, findUser, findUserByEmail, mapUserRecord } from "./repository";
import { requireUser } from "./policy";

export async function readInstanceStatus(database: Database) {
	const record = await findRecord(database, "SELECT name FROM instance WHERE id=1");
	return {
		initialized: Boolean(record),
		name: record ? readStringField(record, "name") : "Flaremail",
	};
}

export async function resolveSessionUser(database: Database, cookie: string | undefined) {
	if (!cookie) {
		return null;
	}

	const record = await findSession(database, await hashSha256(cookie));
	return record ? mapUserRecord(record) : null;
}

export async function issueSession(
	database: Database,
	userId: string,
	setCookie: (value: string) => void,
): Promise<Session> {
	const token = encodeHex(crypto.getRandomValues(new Uint8Array(32)));
	await database.execute({
		sql: "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
		args: [await hashSha256(token), userId, Date.now() + 7 * 86400000],
	});
	setCookie(token);
	const record = await findUser(database, userId);

	if (!record) {
		throw new AppError("UNAUTHORIZED", "Account no longer exists.");
	}

	const status = await readInstanceStatus(database);
	return { user: mapUserRecord(record), instanceName: status.name };
}

export async function completeInstanceSetup(
	database: Database,
	input: Params<"instance.setup">,
	setCookie: (value: string) => void,
) {
	if ((await readInstanceStatus(database)).initialized) {
		throw new AppError("SETUP_COMPLETE", "This instance has already been set up.");
	}

	const hash = await hashPassword(input.password);
	const id = crypto.randomUUID();

	try {
		await runInTransaction(database, async (transactionDatabase) => {
			await transactionDatabase.execute({
				sql: "INSERT INTO instance (id,name,created_at) VALUES (1,?,?)",
				args: [input.instanceName, Date.now()],
			});
			await transactionDatabase.execute({
				sql: "INSERT INTO users (id,email,name,password_hash,instance_admin,must_change_password,created_at) VALUES (?,?,?,?,1,0,?)",
				args: [id, input.email, input.name, hash, Date.now()],
			});
		});
	} catch (error) {
		if ((await readInstanceStatus(database)).initialized) {
			throw new AppError("SETUP_COMPLETE", "This instance has already been set up.");
		}

		throw error;
	}

	return issueSession(database, id, setCookie);
}

export async function rateLimit(database: Database, key: string) {
	const now = Date.now();
	const result = await database.execute({
		sql: `INSERT INTO login_attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count`,
		args: [key, now + 15 * 60000, now, now],
	});

	if (Number(result.rows[0]?.count) > 10) {
		throw new AppError("RATE_LIMITED", "Too many attempts. Try again in 15 minutes.");
	}
}

export async function authenticateUser(
	database: Database,
	input: Params<"auth.login">,
	ip: string,
	setCookie: (value: string) => void,
) {
	await rateLimit(database, await hashSha256(`${ip}:${input.email}`));
	const record = await findUserByEmail(database, input.email);
	const dummyPasswordHash =
		"scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
	const storedPasswordHash = record ? readStringField(record, "password_hash") : dummyPasswordHash;
	const valid = await verifyPassword(input.password, storedPasswordHash);

	if (!record || !valid || Boolean(record.disabled)) {
		throw new AppError("UNAUTHORIZED", "Email or password is incorrect.");
	}

	return issueSession(database, readStringField(record, "id"), setCookie);
}

export async function endSession(database: Database, token: string | undefined) {
	if (token) {
		await database.execute({
			sql: "DELETE FROM sessions WHERE token_hash=?",
			args: [await hashSha256(token)],
		});
	}

	return { ok: true as const };
}

export async function changePassword(
	database: Database,
	user: import("@flaremail/contracts").User | null,
	input: Params<"auth.changePassword">,
	token: string | undefined,
) {
	requireUser(user);
	const record = await findUser(database, user.id);
	const valid =
		record &&
		(await verifyPassword(input.currentPassword, readStringField(record, "password_hash")));

	if (!valid) {
		throw new AppError("VALIDATION", "Current password is incorrect.");
	}

	const hash = await hashPassword(input.password);
	const sessionToken = token ?? "";
	const currentHash = await hashSha256(sessionToken);
	await database.batch(
		[
			{
				sql: "UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?",
				args: [hash, user.id],
			},
			{
				sql: "DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
				args: [user.id, currentHash],
			},
		],
		"write",
	);
	return { ok: true as const };
}
