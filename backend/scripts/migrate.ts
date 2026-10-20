/* eslint-disable no-await-in-loop -- Migrations must be applied in their numbered order. */
import { readdir } from "node:fs/promises";
import { connectScriptDatabase } from "./database";
import type { Client } from "@libsql/client";
import { hashSha256 } from "../src/platform/security/password";

export async function migrateDatabase() {
	const database = connectScriptDatabase();

	try {
		await applyMigrations(database);
	} finally {
		database.close();
	}
}

export async function applyMigrations(database: Client) {
	await database.execute("PRAGMA foreign_keys=ON");
	await database.execute(
		"CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)",
	);
	const migrationDirectory = new URL("../migrations/", import.meta.url);
	const migrationNames = (await readdir(migrationDirectory))
		.filter((filename) => filename.endsWith(".sql"))
		.sort();

	for (const migrationName of migrationNames) {
		const migrationSql = await Bun.file(new URL(migrationName, migrationDirectory)).text();
		const checksum = await hashSha256(migrationSql);
		const applied = await database.execute({
			sql: "SELECT checksum FROM schema_migrations WHERE name=?",
			args: [migrationName],
		});

		if (applied.rows.length) {
			if (applied.rows[0].checksum !== checksum) {
				throw new Error(
					`Migration ${migrationName} changed after it was applied. Create a new migration instead.`,
				);
			}

			continue;
		}

		const transactionDatabase = await database.transaction("write");

		try {
			await transactionDatabase.executeMultiple(migrationSql);
			await transactionDatabase.execute({
				sql: "INSERT INTO schema_migrations (name,checksum,applied_at) VALUES (?,?,?)",
				args: [migrationName, checksum, Date.now()],
			});
			await transactionDatabase.commit();
			console.log(`Applied ${migrationName}`);
		} catch (error) {
			await transactionDatabase.rollback();
			throw error;
		} finally {
			transactionDatabase.close();
		}
	}
}

if (import.meta.main) {
	await migrateDatabase();
}
