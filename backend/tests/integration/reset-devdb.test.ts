import { describe, expect, it } from "bun:test";
import { parseDevelopmentDatabaseConfiguration, resetDatabase } from "../../scripts/reset-devdb";
import { createTestFixture, createTestMailbox, testPassword } from "./helpers";

const developmentConfiguration = [
	"TURSO_DATABASE_URL=libsql://flaremail-development-team.turso.io",
	"TURSO_AUTH_TOKEN=example-test-token",
].join("\n");

describe("development database reset", () => {
	it("reads the development configuration without using shell database overrides", () => {
		const configuration = parseDevelopmentDatabaseConfiguration(
			developmentConfiguration,
			"development",
		);
		expect(configuration).toEqual({
			url: "libsql://flaremail-development-team.turso.io",
			authToken: "example-test-token",
		});
	});
	it("refuses production mode, production names, non-Turso hosts, and missing credentials", () => {
		expect(() =>
			parseDevelopmentDatabaseConfiguration(developmentConfiguration, "production"),
		).toThrow("production mode");
		const productionConfiguration = developmentConfiguration.replace("development", "production");
		expect(() => parseDevelopmentDatabaseConfiguration(productionConfiguration)).toThrow(
			"Refusing to reset",
		);
		const untrustedConfiguration = developmentConfiguration.replace(".turso.io", ".example.com");
		expect(() => parseDevelopmentDatabaseConfiguration(untrustedConfiguration)).toThrow(
			"Refusing to reset",
		);
		expect(() =>
			parseDevelopmentDatabaseConfiguration("TURSO_DATABASE_URL=libsql://dev.turso.io"),
		).toThrow("TURSO_AUTH_TOKEN");
	});
	it("removes linked data, rebuilds the current schema, and makes public setup available again", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			await fixture.database.batch([
				{
					sql: "INSERT INTO blobs (id,mailbox_id,filename,content_type,size,created_at) VALUES ('test-blob',?,'test.txt','text/plain',3,?)",
					args: [mailbox.id, Date.now()],
				},
				{
					sql: "INSERT INTO blob_chunks (blob_id,chunk_index,bytes) VALUES ('test-blob',0,?)",
					args: [new Uint8Array([1, 2, 3])],
				},
				'CREATE TABLE "quoted""table" (id INTEGER PRIMARY KEY, mailbox_id TEXT REFERENCES mailboxes(id))',
			]);
			await resetDatabase(fixture.database);
			const status = await fixture.invokeRpc("instance.status", {}, { token: "" });
			expect(status.body.result).toEqual({ initialized: false, name: "Flaremail" });
			const users = await fixture.database.execute("SELECT COUNT(*) AS count FROM users");
			expect(users.rows[0].count).toBe(0);
			const chunks = await fixture.database.execute("SELECT COUNT(*) AS count FROM blob_chunks");
			expect(chunks.rows[0].count).toBe(0);
			const migrations = await fixture.database.execute(
				"SELECT name FROM schema_migrations ORDER BY name",
			);
			expect(migrations.rows.map((migration) => migration.name)).toEqual([
				"0001_initial.sql",
				"0002_sent_recipient_metadata.sql",
			]);
			const foreignKeyViolations = await fixture.database.execute("PRAGMA foreign_key_check");
			expect(foreignKeyViolations.rows).toHaveLength(0);
			const setup = await fixture.invokeRpc(
				"instance.setup",
				{
					instanceName: "Fresh instance",
					name: "New admin",
					email: "new@example.com",
					password: testPassword,
				},
				{ token: "" },
			);
			expect(setup.body.error).toBeUndefined();
			expect(setup.response.headers.get("set-cookie")).toContain("flaremail_session=");
			await resetDatabase(fixture.database);
			const repeatedStatus = await fixture.invokeRpc("instance.status", {}, { token: "" });
			expect(repeatedStatus.body.result).toEqual({ initialized: false, name: "Flaremail" });
		} finally {
			fixture.database.close();
		}
	});
	it("rolls back dropped tables if dependency ordering fails", async () => {
		const fixture = await createTestFixture();

		try {
			await fixture.database.executeMultiple(
				"CREATE TABLE cycle_a (id INTEGER PRIMARY KEY, b_id INTEGER REFERENCES cycle_b(id)); CREATE TABLE cycle_b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES cycle_a(id));",
			);
			await expect(resetDatabase(fixture.database)).rejects.toThrow("circular table dependencies");
			const users = await fixture.database.execute("SELECT COUNT(*) AS count FROM users");
			expect(users.rows[0].count).toBe(1);
			const cycleTables = await fixture.database.execute(
				"SELECT name FROM sqlite_schema WHERE name IN ('cycle_a','cycle_b')",
			);
			expect(cycleTables.rows).toHaveLength(2);
		} finally {
			fixture.database.close();
		}
	});
});
