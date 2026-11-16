import { createClient } from "@libsql/client/web";

export type ScriptDatabaseConfiguration = { url: string; authToken?: string };

export function connectScriptDatabase(configuration?: ScriptDatabaseConfiguration) {
	if (configuration) {
		return createClient(configuration);
	}

	const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;

	if (!url || !authToken) {
		throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for the intended database.");
	}

	return createClient({ url, authToken });
}
