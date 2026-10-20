import { describe, it, expect } from "bun:test";
import { createTestFixture, testPassword } from "./helpers";
import { completeInstanceSetup } from "../../src/modules/identity/service";
const environment = { APP_ORIGIN: "http://mail.test" };
describe("public setup and CBOR RPC", () => {
	it("bootstraps without authentication and cannot be initialized again", async () => {
		const fixture = await createTestFixture(undefined, false);

		try {
			const status = await fixture.invokeRpc("instance.status", {}, { token: "" });
			expect(status.body.result).toEqual({ initialized: false, name: "Flaremail" });
			const setup = await fixture.invokeRpc(
				"instance.setup",
				{
					instanceName: "My team",
					name: "Admin",
					email: "admin@example.com",
					password: testPassword,
				},
				{ token: "" },
			);
			expect(setup.body.error).toBeUndefined();
			expect(setup.response.headers.get("set-cookie")).toContain("HttpOnly");
			const duplicate = await fixture.invokeRpc(
				"instance.setup",
				{
					instanceName: "Other",
					name: "Attacker",
					email: "other@example.com",
					password: testPassword,
				},
				{ token: "" },
			);
			expect(duplicate.body.error?.data?.kind).toBe("SETUP_COMPLETE");
			const count = await fixture.database.execute(
				"SELECT COUNT(*) AS count FROM users WHERE instance_admin=1",
			);
			expect(count.rows[0].count).toBe(1);
		} finally {
			fixture.database.close();
		}
	});
	it("allows only one winner during simultaneous setup", async () => {
		const fixture = await createTestFixture(undefined, false);

		try {
			const input = {
				instanceName: "One",
				name: "Admin",
				email: "admin@example.com",
				password: testPassword,
			};
			const results = await Promise.allSettled([
				completeInstanceSetup(fixture.database, input, () => {}),
				completeInstanceSetup(fixture.database, input, () => {}),
			]);
			expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		} finally {
			fixture.database.close();
		}
	});
	it("rejects malformed CBOR, empty batches, and endpoint misuse", async () => {
		const fixture = await createTestFixture();

		try {
			const malformed = await fixture.application.fetch(
				new Request("http://mail.test/api/queries", {
					method: "POST",
					headers: { "Content-Type": "application/cbor" },
					body: new Uint8Array([26]),
				}),
				environment,
			);
			expect(fixture.decode(await malformed.arrayBuffer()).error?.code).toBe(-32700);
			const empty = await fixture.application.fetch(
				new Request("http://mail.test/api/queries", {
					method: "POST",
					headers: { "Content-Type": "application/cbor" },
					body: fixture.encode([]),
				}),
				environment,
			);
			expect(fixture.decode(await empty.arrayBuffer()).error?.code).toBe(-32600);
			const wrongEndpoint = await fixture.invokeRpc(
				"organizations.create",
				{ name: "Forbidden write" },
				{ endpoint: "queries" },
			);
			expect(wrongEndpoint.body.error?.code).toBe(-32601);
		} finally {
			fixture.database.close();
		}
	});
	it("supports batches and notifications without inventing notification responses", async () => {
		const fixture = await createTestFixture();

		try {
			const request = { jsonrpc: "2.0", method: "instance.status", params: {} };
			const notification = await fixture.application.fetch(
				new Request("http://mail.test/api/queries", {
					method: "POST",
					headers: { "Content-Type": "application/cbor" },
					body: fixture.encode(request),
				}),
				environment,
			);
			expect(notification.status).toBe(204);
			const batch = await fixture.application.fetch(
				new Request("http://mail.test/api/queries", {
					method: "POST",
					headers: { "Content-Type": "application/cbor" },
					body: fixture.encode([request, Object.assign({}, request, { id: 2 })]),
				}),
				environment,
			);
			expect(
				fixture.decode<import("@flaremail/contracts").RpcResponse[]>(await batch.arrayBuffer()),
			).toEqual([{ jsonrpc: "2.0", id: 2, result: { initialized: true, name: "Test instance" } }]);
		} finally {
			fixture.database.close();
		}
	});
	it("requires CBOR and rejects cross-origin calls", async () => {
		const fixture = await createTestFixture();

		try {
			const wrongType = await fixture.application.fetch(
				new Request("http://mail.test/api/mutations", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "{}",
				}),
				environment,
			);
			expect(wrongType.status).toBe(415);
			const crossOrigin = await fixture.application.fetch(
				new Request("http://mail.test/api/mutations", {
					method: "POST",
					headers: { "Content-Type": "application/cbor", Origin: "https://untrusted.example" },
					body: fixture.encode({}),
				}),
				environment,
			);
			expect(crossOrigin.status).toBe(403);
			const crossSite = await fixture.application.fetch(
				new Request("http://mail.test/api/mutations", {
					method: "POST",
					headers: {
						"Content-Type": "application/cbor",
						Origin: "http://mail.test",
						"Sec-Fetch-Site": "cross-site",
					},
					body: fixture.encode({}),
				}),
				environment,
			);
			expect(crossSite.status).toBe(403);
		} finally {
			fixture.database.close();
		}
	});
	it.each(["http://localhost:5173", "http://127.0.0.1:5173"])(
		"accepts same-origin requests at %s when APP_ORIGIN names another host",
		async (requestOrigin) => {
			const fixture = await createTestFixture(undefined, false);

			try {
				const response = await fixture.application.fetch(
					new Request(`${requestOrigin}/api/queries`, {
						method: "POST",
						headers: {
							"Content-Type": "application/cbor",
							Origin: requestOrigin,
							"Sec-Fetch-Site": "same-origin",
						},
						body: fixture.encode({ jsonrpc: "2.0", id: 1, method: "instance.status", params: {} }),
					}),
					environment,
				);
				expect(response.status).toBe(200);
				expect(fixture.decode(await response.arrayBuffer()).result).toEqual({
					initialized: false,
					name: "Flaremail",
				});
			} finally {
				fixture.database.close();
			}
		},
	);
});
