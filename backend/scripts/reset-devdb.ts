/* eslint-disable no-await-in-loop -- Schema inspection and dependency-ordered drops share one transaction. */
import { parseEnv } from "node:util";
import type { Client, Transaction } from "@libsql/client";
import { connectScriptDatabase } from "./database";
import { applyMigrations } from "./migrate";

export function parseDevelopmentDatabaseConfiguration(
	configurationText: string,
	nodeEnvironment?: string,
) {
	if (!nodeEnvironment || nodeEnvironment === "production") {
		throw new Error(
			"Refusing to reset a database in production mode or with NODE_ENV unset. Set NODE_ENV=development first.",
		);
	}

	const configuration = parseEnv(configurationText);
	const databaseUrl = configuration.TURSO_DATABASE_URL;
	const authToken = configuration.TURSO_AUTH_TOKEN;

	if (!databaseUrl || !authToken) {
		throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the root .dev.vars first.");
	}

	const parsedUrl = new URL(databaseUrl);
	const databaseName = parsedUrl.hostname.split(".")[0];
	const usesTursoCloud = parsedUrl.hostname.endsWith(".turso.io");
	const usesSecureTransport = parsedUrl.protocol === "libsql:" || parsedUrl.protocol === "https:";
	const namesDevelopmentDatabase = /(?:^|-)(?:dev|development)(?:-|$)/.test(databaseName);

	if (!usesTursoCloud || !usesSecureTransport || !namesDevelopmentDatabase) {
		throw new Error(
			"Refusing to reset: .dev.vars must target a Turso Cloud database with dev or development in its name.",
		);
	}

	return { url: databaseUrl, authToken };
}

function quoteSqlIdentifier(identifier: string) {
	const escapedIdentifier = identifier.replaceAll('"', '""');
	return `"${escapedIdentifier}"`;
}

async function readTableDependencies(transactionDatabase: Transaction) {
	const tableRecords = await transactionDatabase.execute(
		"SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'",
	);
	const dependencies = new Map<string, Set<string>>();

	for (const tableRecord of tableRecords.rows) {
		const tableName = String(tableRecord.name);
		const quotedTableName = quoteSqlIdentifier(tableName);
		const foreignKeys = await transactionDatabase.execute(
			`PRAGMA foreign_key_list(${quotedTableName})`,
		);
		const referencedTables = foreignKeys.rows.map((foreignKey) => String(foreignKey.table));
		dependencies.set(tableName, new Set(referencedTables));
	}

	return dependencies;
}

async function dropApplicationTables(transactionDatabase: Transaction) {
	const dependencies = await readTableDependencies(transactionDatabase);

	while (dependencies.size) {
		const referencedTables = new Set<string>();

		for (const [tableName, references] of dependencies) {
			for (const referencedTable of references) {
				if (referencedTable !== tableName) {
					referencedTables.add(referencedTable);
				}
			}
		}

		const removableTables = [...dependencies.keys()].filter(
			(tableName) => !referencedTables.has(tableName),
		);

		if (!removableTables.length) {
			throw new Error(
				"Cannot reset a schema with circular table dependencies; no changes were saved.",
			);
		}

		for (const tableName of removableTables) {
			const quotedTableName = quoteSqlIdentifier(tableName);
			await transactionDatabase.execute(`DROP TABLE ${quotedTableName}`);
			dependencies.delete(tableName);
		}
	}
}

export async function resetDatabase(database: Client) {
	const transactionDatabase = await database.transaction("write");

	try {
		await dropApplicationTables(transactionDatabase);
		await transactionDatabase.commit();
	} catch (error) {
		await transactionDatabase.rollback();
		throw error;
	} finally {
		transactionDatabase.close();
	}

	await applyMigrations(database);
}

if (import.meta.main) {
	const configurationFile = new URL("../../.dev.vars", import.meta.url);
	const configurationText = await Bun.file(configurationFile).text();
	const configuration = parseDevelopmentDatabaseConfiguration(
		configurationText,
		process.env.NODE_ENV,
	);
	const database = connectScriptDatabase(configuration);
	const databaseHostname = new URL(configuration.url).hostname;
	console.log(`Resetting development database: ${databaseHostname}`);

	try {
		await resetDatabase(database);
		console.log("Development database reset. Open /instance/setup to create your instance again.");
	} finally {
		database.close();
	}
}
