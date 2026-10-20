import { describe, it, expect } from "bun:test";
import { forwardInboundEmail } from "../../email-routing/src/index";

function createIncomingMessage() {
	let rejection = "";
	return {
		message: {
			from: "sender@example.net",
			to: "hello@example.com",
			rawSize: 7,
			raw: new Response("message").body!,
			setReject(reason: string) {
				rejection = reason;
			},
		},
		readRejection: () => rejection,
	};
}

describe("Email Routing HTTP forwarding", () => {
	it("forwards raw MIME and trusted envelope fields without auth", async () => {
		const incoming = createIncomingMessage();
		let requestCount = 0;
		await forwardInboundEmail(
			incoming.message,
			{ INBOUND_URL: "https://mail.test/api/webhooks/inbound" },
			async (url, options) => {
				requestCount++;
				expect(url).toEndWith("/api/webhooks/inbound");
				const headers = new Headers(options.headers);
				expect(headers.get("X-Envelope-To")).toBe("hello@example.com");
				expect(headers.has("Authorization")).toBe(false);
				expect(new TextDecoder().decode(options.body as ArrayBuffer)).toBe("message");
				return new Response(null, { status: 200 });
			},
		);
		expect(requestCount).toBe(1);
		expect(incoming.readRejection()).toBe("");
	});
	it("retries network/server failures and propagates exhausted failures", async () => {
		const incoming = createIncomingMessage();
		let requests = 0;
		await forwardInboundEmail(
			incoming.message,
			{ INBOUND_URL: "https://mail.test/inbound" },
			async () => {
				requests++;

				if (requests === 1) {
					throw new Error("Network unavailable");
				}

				return new Response(null, { status: requests === 2 ? 503 : 200 });
			},
		);
		expect(requests).toBe(3);
		const failed = createIncomingMessage();
		await expect(
			forwardInboundEmail(
				failed.message,
				{ INBOUND_URL: "https://mail.test/inbound" },
				async () => new Response(null, { status: 503 }),
			),
		).rejects.toThrow("three attempts");
	});
	it("rejects unknown recipients and oversize mail without unnecessary retries", async () => {
		const unknown = createIncomingMessage();
		await forwardInboundEmail(
			unknown.message,
			{ INBOUND_URL: "https://mail.test/inbound" },
			async () => new Response(null, { status: 404 }),
		);
		expect(unknown.readRejection()).toContain("not available");
		const oversize = createIncomingMessage();
		oversize.message.rawSize = 6 * 1024 * 1024;
		await forwardInboundEmail(
			oversize.message,
			{ INBOUND_URL: "https://mail.test/inbound" },
			async () => {
				throw new Error("Should not call the endpoint");
			},
		);
		expect(oversize.readRejection()).toContain("limit");
	});
});
