/* eslint-disable no-await-in-loop -- Exercise delivery order in one mailbox. */
import { describe, expect, it } from "bun:test";
import { createTestFixture, createTestMailbox } from "./helpers";
import { ingestEmail } from "../../src/modules/mail/ingest";
import { listMail, readThread, createLabel } from "../../src/modules/mail/service";
import { createMailbox } from "../../src/modules/mailboxes/service";
import { saveDraft } from "../../src/modules/mail/drafts";
import { sendMail } from "../../src/modules/mail/send";
import { createEmptyDraft } from "../../../frontend/src/features/compose/create-draft";

function buildMime(messageId: string, references: string[] = []) {
	return new TextEncoder().encode(
		[
			"From: sender@example.net",
			"To: hello@example.com",
			`Message-ID: <${messageId}@example.net>`,
			`References: ${references.map((reference) => `<${reference}@example.net>`).join(" ")}`,
			"Subject: Conversation",
			"",
			messageId,
		].join("\r\n"),
	);
}

describe("conversation consistency", () => {
	it("includes sent replies in folder, search and label summaries", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);
			const received = await ingestEmail(fixture.database, buildMime("original"), {
				from: "sender@example.net",
				to: mailbox.address,
			});
			const draft = await saveDraft(
				fixture.database,
				fixture.admin,
				Object.assign(createEmptyDraft(mailbox.id), {
					to: ["sender@example.net"],
					subject: "Re: Conversation",
					text: "Newest reply",
					replyToMessageId: "<original@example.net>",
				}),
			);
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
						return { messageId: "<sent@example.net>" };
					},
				},
			);
			// Avoid timestamp ties in the fixture.
			await fixture.database.execute("UPDATE messages SET received_at=1 WHERE id=?", [received.id]);

			for (const folder of ["inbox", "sent", "all"] as const) {
				const list = await listMail(fixture.database, fixture.admin, {
					mailboxId: mailbox.id,
					folder,
				});
				expect(list.total).toBe(1);
				expect(list.items[0].count).toBe(2);
				expect(list.items[0].snippet).toBe("Newest reply");
				expect(list.items[0].unread).toBe(true);
			}

			const search = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "all",
				search: "original",
			});
			expect(search.items[0].count).toBe(2);
			expect(search.items[0].snippet).toBe("Newest reply");
			const label = await createLabel(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				name: "Work",
				color: "#123456",
			});
			await fixture.database.execute(
				"INSERT INTO message_labels (message_id,label_id) VALUES (?,?)",
				[received.id, label.id],
			);
			const labeled = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "all",
				labelId: label.id,
			});
			expect(labeled.items[0].count).toBe(2);
			expect(labeled.items[0].snippet).toBe("Newest reply");
			const thread = await readThread(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				threadId: received.id,
			});
			expect(thread).toHaveLength(2);
		} finally {
			fixture.database.close();
		}
	});

	it.each([
		[
			["reply", ["parent"]],
			["parent", []],
		],
		[
			["child", ["parent", "reply"]],
			["parent", []],
			["reply", ["parent"]],
		],
		[
			["sibling-a", ["parent"]],
			["sibling-b", ["parent"]],
			["parent", []],
		],
		[
			["parent", []],
			["child", ["missing"]],
			["bridge", ["parent", "missing"]],
		],
	] as [string, string[]][][])("reconciles delivery order %j", async (...deliveries) => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture);

			for (const [messageId, references] of deliveries) {
				await ingestEmail(fixture.database, buildMime(messageId, references), {
					from: "sender@example.net",
					to: mailbox.address,
				});
			}

			const list = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "inbox",
			});
			expect(list.total).toBe(1);
			expect(list.items[0].count).toBe(deliveries.length);
		} finally {
			fixture.database.close();
		}
	});

	it("does not join unrelated mail or messages in another mailbox", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox, organization, domain } = await createTestMailbox(fixture);

			for (const messageId of ["one", "two"]) {
				await ingestEmail(fixture.database, buildMime(messageId), {
					from: "sender@example.net",
					to: mailbox.address,
				});
			}

			const otherMailbox = await createMailbox(fixture.database, fixture.admin, {
				orgId: organization.id,
				domainId: domain.id,
				localPart: "other",
				name: "Other",
			});
			await ingestEmail(fixture.database, buildMime("other", ["one"]), {
				from: "sender@example.net",
				to: otherMailbox.address,
			});
			const otherMessage = await fixture.database.execute(
				"SELECT thread_id FROM messages WHERE mailbox_id=?",
				[otherMailbox.id],
			);
			const firstMessage = await fixture.database.execute(
				"SELECT thread_id FROM messages WHERE mailbox_id=? AND message_id=?",
				[mailbox.id, "<one@example.net>"],
			);
			expect(otherMessage.rows[0].thread_id).not.toBe(firstMessage.rows[0].thread_id);

			const list = await listMail(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				folder: "inbox",
			});
			expect(list.total).toBe(2);
		} finally {
			fixture.database.close();
		}
	});
});
