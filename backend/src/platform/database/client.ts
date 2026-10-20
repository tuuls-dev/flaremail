import { createClient } from "@libsql/client/web";
import type { Client, InValue, Row, Transaction } from "@libsql/client";
export type Database = Pick<Client, "execute" | "batch" | "transaction">;
export type Executor = Pick<Transaction, "execute">;

export function connectDatabase(environment: {
	TURSO_DATABASE_URL: string;
	TURSO_AUTH_TOKEN?: string;
}) {
	return createClient({
		url: environment.TURSO_DATABASE_URL,
		authToken: environment.TURSO_AUTH_TOKEN,
	});
}

export async function findRecord(database: Executor, sql: string, args: InValue[] = []) {
	const result = await database.execute({ sql, args });
	return result.rows[0];
}

export function readStringField(record: Row, key: string) {
	const fieldValue = record[key] ?? "";
	return String(fieldValue);
}

export function readNumberField(record: Row, key: string) {
	const fieldValue = record[key] ?? 0;
	return Number(fieldValue);
}

export function parseJsonField<T>(record: Row, key: string): T {
	return JSON.parse(readStringField(record, key)) as T;
}

export async function runInTransaction<T>(
	database: Database,
	run: (transactionDatabase: Transaction) => Promise<T>,
): Promise<T> {
	const transactionDatabase = await database.transaction("write");

	try {
		const value = await run(transactionDatabase);
		await transactionDatabase.commit();
		return value;
	} catch (error) {
		await transactionDatabase.rollback();
		throw error;
	} finally {
		transactionDatabase.close();
	}
}
