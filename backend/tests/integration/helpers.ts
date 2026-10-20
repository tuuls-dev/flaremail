import { createClient } from "@libsql/client";
import { Encoder, Decoder } from "cbor-x";
import { createApp } from "../../src/app";
import { completeInstanceSetup } from "../../src/modules/identity/service";
import { createOrganization } from "../../src/modules/organizations/service";
import { createDomain, updateDomain } from "../../src/modules/domains/service";
import { createMailbox, setGrant } from "../../src/modules/mailboxes/service";
import type { Sender } from "../../src/platform/email/sender";
import type { MethodName, Params, RpcResponse, User } from "@flaremail/contracts";
const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ mapsAsObjects: true });
export const testPassword = "a-test-password-only-2026";

export async function createTestFixture(
	sender: Sender = {
		async send() {
			return { messageId: "<test-provider-id@example.com>" };
		},
	},
	initialize = true,
) {
	const database = createClient({ url: "file::memory:" });
	await database.executeMultiple(
		await Bun.file(new URL("../../migrations/0001_initial.sql", import.meta.url)).text(),
	);
	await database.executeMultiple(
		await Bun.file(
			new URL("../../migrations/0002_sent_recipient_metadata.sql", import.meta.url),
		).text(),
	);
	let sessionToken = "";
	let admin: User | null = null;

	if (initialize) {
		const session = await completeInstanceSetup(
			database,
			{
				instanceName: "Test instance",
				name: "Alex",
				email: "alex@example.com",
				password: testPassword,
			},
			(token) => {
				sessionToken = token;
			},
		);
		admin = session.user;
	}

	const application = createApp({ database, sender });

	async function invokeRpc<K extends MethodName>(
		method: K,
		params: Params<K>,
		options: { token?: string; endpoint?: "queries" | "mutations" } = {},
	) {
		const endpoint =
			options.endpoint ??
			(method.startsWith("auth.session") || method.startsWith("instance.status")
				? "queries"
				: "mutations");
		const requestBody = encoder.encode({ jsonrpc: "2.0", id: 1, method, params });
		const token = options.token ?? sessionToken;
		const headers: Record<string, string> = {
			"Content-Type": "application/cbor",
			Origin: "http://mail.test",
		};

		if (token) {
			headers.Cookie = `flaremail_session=${token}`;
		}

		const response = await application.fetch(
			new Request(`http://mail.test/api/${endpoint}`, {
				method: "POST",
				headers,
				body: new Uint8Array(requestBody),
			}),
			{ APP_ORIGIN: "http://mail.test" },
		);
		const body = decoder.decode(new Uint8Array(await response.arrayBuffer())) as RpcResponse;
		return { response, body };
	}

	return {
		database,
		admin,
		application,
		invokeRpc,
		getToken: () => sessionToken,
		encode: (value: unknown) => new Uint8Array(encoder.encode(value)),
		decode: <T = RpcResponse>(bytes: ArrayBuffer) => decoder.decode(new Uint8Array(bytes)) as T,
	};
}

export async function createTestMailbox(
	fixture: Awaited<ReturnType<typeof createTestFixture>>,
	grantAccess = true,
) {
	const { database, admin } = fixture;
	const organization = await createOrganization(database, admin, "Studio");
	const domain = await createDomain(database, admin, organization.id, "example.com");
	await updateDomain(database, admin, { orgId: organization.id, id: domain.id, ready: true });
	const mailbox = await createMailbox(database, admin, {
		orgId: organization.id,
		domainId: domain.id,
		localPart: "hello",
		name: "Team inbox",
	});

	if (grantAccess) {
		await setGrant(database, admin, { mailboxId: mailbox.id, userId: admin!.id }, false);
	}

	return { organization, domain, mailbox };
}
