import { createClient } from "@libsql/client/web";

export type ScriptDatabaseConfiguration = { url: string; authToken?: string };

export function connectScriptDatabase(
	configuration: ScriptDatabaseConfiguration = {
		url: process.env.TURSO_DATABASE_URL ?? "libsql://configure-before-deployment.turso.io",
		authToken: process.env.TURSO_AUTH_TOKEN,
	},
) {
	return createClient(configuration);
}
