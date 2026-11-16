import { describe, expect, it, mock, spyOn } from "bun:test";
import { MAX_MESSAGE_SIZE } from "@flaremail/contracts";
import { receiveInboundEmail } from "../../src/transport/inbound/handler";
import { createTestFixture, createTestMailbox } from "./helpers";

async function readFixtureMail() {
	return Bun.file(new URL("../fixtures/conversation.eml", import.meta.url)).arrayBuffer();
}

function createIncomingMessage(
	rawEmail: ArrayBuffer,
	recipient: string,
	sender = "sender@example.net",
) {
	return {
		from: sender,
		to: recipient,
		rawSize: rawEmail.byteLength,
		raw: new Response(rawEmail).body!,
		setReject: mock((_reason: string) => {}),
	};
}

describe("native inbound email", () => {
	it("delivers to the envelope recipient and deduplicates repeated delivery", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const mime = new TextDecoder().decode(await readFixtureMail());
			const mimeWithDifferentRecipient = mime.replace("hello@example.com", "other@example.com");
			const rawEmail = new TextEncoder().encode(mimeWithDifferentRecipient).buffer;
			const incoming = createIncomingMessage(rawEmail, mailbox.address.toUpperCase());
			const duplicate = createIncomingMessage(rawEmail, mailbox.address);
			await receiveInboundEmail(incoming, fixture.database);
			await receiveInboundEmail(duplicate, fixture.database);
			expect(incoming.setReject).not.toHaveBeenCalled();
			expect(duplicate.setReject).not.toHaveBeenCalled();
			const { rows } = await fixture.database.execute("SELECT mailbox_id, folder FROM messages");
			expect(rows).toHaveLength(1);
			expect(rows[0].mailbox_id).toBe(mailbox.id);
			expect(rows[0].folder).toBe("inbox");
		} finally {
			fixture.database.close();
		}
	});

	it("rejects invalid envelopes and oversized messages before reading raw MIME", async () => {
		const fixture = await createTestFixture(undefined, false);

		try {
			const rawEmail = await readFixtureMail();
			const invalidRecipient = createIncomingMessage(rawEmail, "invalid");
			const invalidSender = createIncomingMessage(rawEmail, "hello@example.com", "bad\r\nsender");
			const oversize = createIncomingMessage(rawEmail, "hello@example.com");
			oversize.rawSize = MAX_MESSAGE_SIZE + 1;
			const messages = [invalidRecipient, invalidSender, oversize];
			await Promise.all(messages.map((message) => receiveInboundEmail(message, fixture.database)));
			expect(invalidRecipient.setReject).toHaveBeenCalledWith(
				"Valid envelope metadata is required.",
			);
			expect(invalidSender.setReject).toHaveBeenCalledWith("Valid envelope metadata is required.");
			expect(oversize.setReject).toHaveBeenCalledWith(
				"Message exceeds the 5 MiB application limit.",
			);
			expect(messages.every((message) => !message.raw.locked)).toBe(true);
		} finally {
			fixture.database.close();
		}
	});

	it("rejects missing or disabled mailboxes and unready domains", async () => {
		const fixture = await createTestFixture();

		try {
			const { domain, mailbox } = await createTestMailbox(fixture);
			const rawEmail = await readFixtureMail();
			const missing = createIncomingMessage(rawEmail, "missing@example.com");
			await receiveInboundEmail(missing, fixture.database);
			await fixture.database.execute("UPDATE mailboxes SET disabled=1 WHERE id=?", [mailbox.id]);
			const disabled = createIncomingMessage(rawEmail, mailbox.address);
			await receiveInboundEmail(disabled, fixture.database);
			await fixture.database.execute("UPDATE mailboxes SET disabled=0 WHERE id=?", [mailbox.id]);
			await fixture.database.execute("UPDATE domains SET ready=0 WHERE id=?", [domain.id]);
			const unready = createIncomingMessage(rawEmail, mailbox.address);
			await receiveInboundEmail(unready, fixture.database);
			expect(missing.setReject).toHaveBeenCalledWith("Recipient mailbox is not available.");
			expect(disabled.setReject).toHaveBeenCalledWith("Recipient mailbox is not available.");
			expect(unready.setReject).toHaveBeenCalledWith("Recipient mailbox is not available.");
		} finally {
			fixture.database.close();
		}
	});

	it("reuses the raw message when a transient database failure clears", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const rawEmail = await readFixtureMail();
			const incoming = createIncomingMessage(rawEmail, mailbox.address);
			spyOn(fixture.database, "execute").mockRejectedValueOnce(new Error("Database unavailable"));
			await receiveInboundEmail(incoming, fixture.database);
			expect(incoming.setReject).not.toHaveBeenCalled();
			const { rows } = await fixture.database.execute("SELECT mailbox_id FROM messages");
			expect(rows).toHaveLength(1);
			expect(rows[0].mailbox_id).toBe(mailbox.id);
		} finally {
			fixture.database.close();
		}
	});

	it("surfaces an unexpected failure after three attempts", async () => {
		const fixture = await createTestFixture(undefined, false);

		try {
			const rawEmail = await readFixtureMail();
			const incoming = createIncomingMessage(rawEmail, "hello@example.com");
			const error = new Error("Database unavailable");
			const execute = spyOn(fixture.database, "execute").mockRejectedValue(error);
			await expect(receiveInboundEmail(incoming, fixture.database)).rejects.toBe(error);
			expect(execute).toHaveBeenCalledTimes(3);
			expect(incoming.setReject).not.toHaveBeenCalled();
		} finally {
			fixture.database.close();
		}
	});

	it("returns 404 for the former HTTP webhook", async () => {
		const fixture = await createTestFixture(undefined, false);

		try {
			const request = new Request("http://mail.test/api/webhooks/inbound", {
				method: "POST",
				headers: { "Content-Type": "message/rfc822", "X-Envelope-To": "hello@example.com" },
				body: await readFixtureMail(),
			});
			const response = await fixture.application.fetch(request, { APP_ORIGIN: "http://mail.test" });
			expect(response.status).toBe(404);
		} finally {
			fixture.database.close();
		}
	});
});
