import { describe, it, expect } from "bun:test";
import { createTestFixture, createTestMailbox } from "./helpers";
import { ingestEmail } from "../../src/modules/mail/ingest";
import {
	readThread,
	listMail,
	createLabel,
	labelMail,
	removeLabel,
	listLabels,
	updateMail,
	restoreMessageFolders,
} from "../../src/modules/mail/service";
import { saveDraft, getDraft, listDrafts } from "../../src/modules/mail/drafts";
import { sendMail } from "../../src/modules/mail/send";
import {
	beginUpload,
	uploadChunk,
	readBlob,
	downloadChunk,
	copyAttachment,
} from "../../src/modules/mail/blobs";
import { createEmptyDraft } from "../../../frontend/src/features/compose/create-draft";
import { CHUNK_SIZE } from "@flaremail/contracts";

async function readFixtureMail() {
	return new Uint8Array(
		await Bun.file(new URL("../fixtures/conversation.eml", import.meta.url)).arrayBuffer(),
	);
}

describe("mail ingestion, drafts, and sending", () => {
	it("uses envelope recipients, sanitizes HTML, deduplicates, and threads replies", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const rawEmail = await readFixtureMail();
			const delivered = await ingestEmail(fixture.database, rawEmail, {
				from: "bounce@example.net",
				to: mailbox.address,
			});
			const duplicate = await ingestEmail(fixture.database, rawEmail, {
				from: "bounce@example.net",
				to: mailbox.address,
			});
			expect(duplicate.duplicate).toBe(true);
			expect(duplicate.id).toBe(delivered.id);
			const list = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "inbox",
				search: "next week",
			});
			expect(list.total).toBe(1);
			const messages = await readThread(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				threadId: list.items[0].threadId,
			});
			expect(messages[0].html).not.toContain("<script");
			expect(messages[0].html).not.toContain("onerror");
			expect(messages[0].text).toContain("Hi team");
			const reply = new TextEncoder().encode(
				"From: sam@example.net\r\nTo: undisclosed-recipients:;\r\nSubject: Re: A little something for next week\r\nMessage-ID: <reply@example.net>\r\nIn-Reply-To: <first-conversation@example.net>\r\n\r\nLooks good to me!",
			);
			await ingestEmail(fixture.database, reply, { from: "sam@example.net", to: mailbox.address });
			const threaded = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "inbox",
			});
			expect(threaded.total).toBe(1);
			expect(threaded.items[0].count).toBe(2);
			await expect(
				ingestEmail(fixture.database, rawEmail, {
					from: "jordan@example.net",
					to: "missing@example.com",
				}),
			).rejects.toThrow("not available");
		} finally {
			fixture.database.close();
		}
	});
	it("accepts the intentionally unauthenticated webhook and refuses unknown recipients", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const rawEmail = await readFixtureMail();
			const response = await fixture.application.fetch(
				new Request("http://mail.test/api/webhooks/inbound", {
					method: "POST",
					headers: {
						"Content-Type": "message/rfc822",
						"X-Envelope-From": "jordan@example.net",
						"X-Envelope-To": mailbox.address,
					},
					body: new Uint8Array(rawEmail),
				}),
				{ APP_ORIGIN: "http://mail.test" },
			);
			expect(response.status).toBe(200);
			const missing = await fixture.application.fetch(
				new Request("http://mail.test/api/webhooks/inbound", {
					method: "POST",
					headers: { "X-Envelope-To": "nope@example.com" },
					body: new Uint8Array(rawEmail),
				}),
				{ APP_ORIGIN: "http://mail.test" },
			);
			expect(missing.status).toBe(404);
		} finally {
			fixture.database.close();
		}
	});
	it("detects competing draft saves and prevents other users from opening private drafts", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const draft = createEmptyDraft(mailbox.id);
			draft.subject = "First version";
			const saved = await saveDraft(fixture.database, fixture.admin, draft);
			expect(saved.version).toBe(1);
			await expect(saveDraft(fixture.database, fixture.admin, draft)).rejects.toThrow(
				"updated elsewhere",
			);
			const anotherUser = Object.assign({}, fixture.admin!, { id: "unassigned-person" });
			await expect(
				getDraft(fixture.database, anotherUser, { id: draft.id, mailboxId: mailbox.id }),
			).rejects.toThrow("do not have access");
			const updated = await saveDraft(
				fixture.database,
				fixture.admin,
				Object.assign({}, saved, { subject: "Second version" }),
			);
			expect(updated.version).toBe(2);
			await expect(saveDraft(fixture.database, fixture.admin, saved)).rejects.toThrow(
				"changed in another tab",
			);
		} finally {
			fixture.database.close();
		}
	});
	it("reconstructs binary chunks exactly and rejects incomplete or misplaced chunks", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const draft = await saveDraft(fixture.database, fixture.admin, createEmptyDraft(mailbox.id));
			const binarySize = CHUNK_SIZE + 17;
			const bytes = new Uint8Array(binarySize);
			bytes.fill(173);
			bytes[CHUNK_SIZE] = 42;
			const attachment = await beginUpload(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				draftId: draft.id,
				filename: "notes.bin",
				contentType: "application/octet-stream",
				size: bytes.length,
			});
			const firstChunk = bytes.slice(0, CHUNK_SIZE);
			await uploadChunk(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				id: attachment.id,
				index: 0,
				bytes: firstChunk,
			});
			await expect(readBlob(fixture.database, attachment.id)).rejects.toThrow("not finished");
			const finalChunk = bytes.slice(CHUNK_SIZE);
			await uploadChunk(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				id: attachment.id,
				index: 1,
				bytes: finalChunk,
			});
			expect(await readBlob(fixture.database, attachment.id)).toEqual(bytes);
			const downloaded = await downloadChunk(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				blobId: attachment.id,
				index: 1,
			});
			expect(downloaded.bytes).toEqual(finalChunk);
			await saveDraft(
				fixture.database,
				fixture.admin,
				Object.assign({}, draft, { attachmentIds: [attachment.id] }),
			);
			await expect(
				uploadChunk(fixture.database, fixture.admin, {
					mailboxId: mailbox.id,
					id: attachment.id,
					index: 0,
					bytes: firstChunk,
				}),
			).rejects.toThrow("finalized");

			await expect(
				uploadChunk(fixture.database, fixture.admin, {
					mailboxId: mailbox.id,
					id: attachment.id,
					index: 2,
					bytes: new Uint8Array([1]),
				}),
			).rejects.toThrow("finalized");
		} finally {
			fixture.database.close();
		}
	});
	it("submits only once when an accepted send is repeated and retains a Sent copy", async () => {
		let sendCount = 0;
		const fixture = await createTestFixture({
			async send(message) {
				sendCount++;
				expect(message.text).toBe("Hello there");
				return { messageId: "<accepted@example.com>" };
			},
		});

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const initialDraft = createEmptyDraft(mailbox.id);
			Object.assign(initialDraft, {
				to: ["recipient@example.net"],
				subject: "Hello",
				text: "Hello there",
				html: "<p>Hello there</p>",
			});
			const draft = await saveDraft(fixture.database, fixture.admin, initialDraft);
			const request = {
				mailboxId: mailbox.id,
				draftId: draft.id,
				version: draft.version,
				idempotencyKey: crypto.randomUUID(),
			};
			const sent = await sendMail(fixture.database, fixture.admin, request, {
				async send() {
					sendCount++;
					return { messageId: "<accepted@example.com>" };
				},
			});
			expect(sent.status).toBe("sent");
			const repeated = await sendMail(fixture.database, fixture.admin, request, {
				async send() {
					throw new Error("Must not execute twice");
				},
			});
			expect(repeated.status).toBe("sent");
			expect(sendCount).toBe(1);
			expect(await listDrafts(fixture.database, fixture.admin, mailbox.id)).toHaveLength(0);
			const sentMail = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "sent",
			});
			expect(sentMail.items).toHaveLength(1);
		} finally {
			fixture.database.close();
		}
	});
	it("locks ambiguous outcomes instead of silently retrying delivery", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const initialDraft = createEmptyDraft(mailbox.id);
			initialDraft.to = ["recipient@example.net"];
			const draft = await saveDraft(fixture.database, fixture.admin, initialDraft);
			const request = {
				mailboxId: mailbox.id,
				draftId: draft.id,
				version: draft.version,
				idempotencyKey: crypto.randomUUID(),
			};
			const uncertain = await sendMail(fixture.database, fixture.admin, request, {
				async send() {
					throw new Error("Connection lost after submission");
				},
			});
			expect(uncertain.status).toBe("unknown");
			await expect(saveDraft(fixture.database, fixture.admin, draft)).rejects.toThrow(
				"uncertain send outcome",
			);
			const retried = await sendMail(
				fixture.database,
				fixture.admin,
				Object.assign({}, request, { idempotencyKey: crypto.randomUUID() }),
				{
					async send() {
						throw new Error("Must not resubmit");
					},
				},
			);
			expect(retried.status).toBe("unknown");
		} finally {
			fixture.database.close();
		}
	});
	it("keeps definitively rejected drafts editable for a deliberate retry", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const initialDraft = createEmptyDraft(mailbox.id);
			initialDraft.to = ["recipient@example.net"];
			const draft = await saveDraft(fixture.database, fixture.admin, initialDraft);
			const request = {
				mailboxId: mailbox.id,
				draftId: draft.id,
				version: draft.version,
				idempotencyKey: crypto.randomUUID(),
			};
			const failure = Object.assign(new Error("Sending quota reached"), {
				code: "E_DAILY_LIMIT_EXCEEDED",
			});
			const result = await sendMail(fixture.database, fixture.admin, request, {
				async send() {
					throw failure;
				},
			});
			expect(result.status).toBe("failed");
			const edited = await saveDraft(
				fixture.database,
				fixture.admin,
				Object.assign({}, draft, { subject: "Keep this draft" }),
			);
			expect(edited.version).toBe(2);
		} finally {
			fixture.database.close();
		}
	});
	it("copies forwarded attachments without exposing the original draft or losing Bcc", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const mime = [
				"From: sender@example.net",
				"To: hello@example.com",
				"Subject: Attachment",
				"Message-ID: <attachment@example.net>",
				"MIME-Version: 1.0",
				'Content-Type: multipart/mixed; boundary="attachment-boundary"',
				"",
				"--attachment-boundary",
				"Content-Type: text/plain",
				"",
				"A small attachment.",
				"--attachment-boundary",
				'Content-Type: application/octet-stream; name="notes.bin"',
				'Content-Disposition: attachment; filename="notes.bin"',
				"Content-Transfer-Encoding: base64",
				"",
				"AQIDBA==",
				"--attachment-boundary--",
			].join("\r\n");
			const received = await ingestEmail(fixture.database, new TextEncoder().encode(mime), {
				from: "sender@example.net",
				to: mailbox.address,
			});
			const conversation = await readThread(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				threadId: received.id,
			});
			expect(conversation[0].attachments).toHaveLength(1);
			const initialDraft = createEmptyDraft(mailbox.id);
			initialDraft.to = ["recipient@example.net"];
			initialDraft.bcc = ["private@example.net"];
			const draft = await saveDraft(fixture.database, fixture.admin, initialDraft);
			const copied = await copyAttachment(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				draftId: draft.id,
				attachmentId: conversation[0].attachments[0].id,
			});
			expect(copied.id).not.toBe(conversation[0].attachments[0].id);
			expect(await readBlob(fixture.database, copied.id)).toEqual(new Uint8Array([1, 2, 3, 4]));
			const readyDraft = await saveDraft(
				fixture.database,
				fixture.admin,
				Object.assign({}, draft, { attachmentIds: [copied.id] }),
			);
			const result = await sendMail(
				fixture.database,
				fixture.admin,
				{
					mailboxId: mailbox.id,
					draftId: draft.id,
					version: readyDraft.version,
					idempotencyKey: crypto.randomUUID(),
				},
				{
					async send(message) {
						expect(message.attachments[0].content).toBe("AQIDBA==");
						expect(message.bcc).toEqual(["private@example.net"]);
						return { messageId: "<forwarded@example.com>" };
					},
				},
			);
			expect(result.status).toBe("sent");
			const sent = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "sent",
			});
			const sentThread = await readThread(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				threadId: sent.items[0].threadId,
			});
			expect(sentThread[0].bcc).toEqual(["private@example.net"]);
		} finally {
			fixture.database.close();
		}
	});
	it("undoes archive without turning a mixed Inbox/Sent thread into one folder", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const received = await ingestEmail(fixture.database, await readFixtureMail(), {
				from: "jordan@example.net",
				to: mailbox.address,
			});
			const initialDraft = createEmptyDraft(mailbox.id);
			initialDraft.to = ["jordan@example.net"];
			initialDraft.replyToMessageId = "<first-conversation@example.net>";
			const draft = await saveDraft(fixture.database, fixture.admin, initialDraft);
			await sendMail(
				fixture.database,
				fixture.admin,
				{
					mailboxId: mailbox.id,
					draftId: draft.id,
					version: draft.version,
					idempotencyKey: crypto.randomUUID(),
				},
				{
					async send() {
						return { messageId: "<undo-test@example.com>" };
					},
				},
			);
			const updated = await updateMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				threadIds: [received.id],
				folder: "archive",
			});
			expect(updated.previousFolders.map((state) => state.folder).sort()).toEqual([
				"inbox",
				"sent",
			]);
			await restoreMessageFolders(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				states: updated.previousFolders,
			});
			const folderStates = await fixture.database.execute({
				sql: "SELECT folder FROM messages WHERE mailbox_id=? ORDER BY folder",
				args: [mailbox.id],
			});
			expect(folderStates.rows.map((record) => record.folder)).toEqual(["inbox", "sent"]);
		} finally {
			fixture.database.close();
		}
	});
	it("applies and removes mailbox-scoped labels from searchable conversations", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const received = await ingestEmail(fixture.database, await readFixtureMail(), {
				from: "jordan@example.net",
				to: mailbox.address,
			});
			const label = await createLabel(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				name: "Projects",
				color: "#7774cf",
			});
			await labelMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				threadIds: [received.id],
				labelId: label.id,
				remove: false,
			});
			const matches = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "all",
				search: "ideas",
				labelId: label.id,
			});
			expect(matches.total).toBe(1);
			expect(matches.items[0].labels[0].name).toBe("Projects");
			await removeLabel(fixture.database, fixture.admin, { mailboxId: mailbox.id, id: label.id });
			expect(await listLabels(fixture.database, fixture.admin, mailbox.id)).toHaveLength(0);
			const removed = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "all",
				labelId: label.id,
			});
			expect(removed.total).toBe(0);
		} finally {
			fixture.database.close();
		}
	});
});
