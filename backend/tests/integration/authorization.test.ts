import { saveDraft, getDraft, listDrafts } from "../../src/modules/mail/drafts";
import { beginUpload, downloadChunk } from "../../src/modules/mail/blobs";
import { createEmptyDraft } from "../../../frontend/src/features/compose/create-draft";
import { describe, it, expect } from "bun:test";
import { createTestFixture, createTestMailbox, testPassword } from "./helpers";
import {
	createMember,
	createOrganization,
	changeMember,
} from "../../src/modules/organizations/service";
import { requireMailbox } from "../../src/modules/mailboxes/policy";
import { setGrant } from "../../src/modules/mailboxes/service";
import { requireOrgAdmin } from "../../src/modules/organizations/policy";
import { findUserByEmail, mapUserRecord } from "../../src/modules/identity/repository";
describe("identity and organization isolation", () => {
	it("does not grant message access just because someone is an instance admin", async () => {
		const fixture = await createTestFixture();

		try {
			const { mailbox } = await createTestMailbox(fixture, false);
			await expect(requireMailbox(fixture.database, fixture.admin, mailbox.id)).rejects.toThrow(
				"do not have access",
			);
			await setGrant(
				fixture.database,
				fixture.admin,
				{ mailboxId: mailbox.id, userId: fixture.admin!.id },
				false,
			);
			expect((await requireMailbox(fixture.database, fixture.admin, mailbox.id)).id).toBe(
				mailbox.id,
			);
		} finally {
			fixture.database.close();
		}
	});
	it("scopes delegated administration while keeping the instance override", async () => {
		const fixture = await createTestFixture();

		try {
			const { organization } = await createTestMailbox(fixture);
			const otherOrg = await createOrganization(fixture.database, fixture.admin, "Other team");
			await createMember(fixture.database, fixture.admin, {
				orgId: organization.id,
				name: "Jordan",
				email: "jordan@example.com",
				password: testPassword,
				role: "admin",
			});
			const memberRecord = await findUserByEmail(fixture.database, "jordan@example.com");
			const orgAdmin = mapUserRecord(memberRecord!);
			await expect(
				requireOrgAdmin(fixture.database, orgAdmin, organization.id),
			).resolves.toBeTruthy();
			await expect(requireOrgAdmin(fixture.database, orgAdmin, otherOrg.id)).rejects.toThrow(
				"administrator access",
			);
			await expect(
				requireOrgAdmin(fixture.database, fixture.admin, otherOrg.id),
			).resolves.toBeTruthy();
		} finally {
			fixture.database.close();
		}
	});
	it("revokes mailbox access as soon as membership is removed", async () => {
		const fixture = await createTestFixture();

		try {
			const { organization, mailbox } = await createTestMailbox(fixture);
			await createMember(fixture.database, fixture.admin, {
				orgId: organization.id,
				name: "Sam",
				email: "sam@example.com",
				password: testPassword,
				role: "member",
			});
			const member = mapUserRecord((await findUserByEmail(fixture.database, "sam@example.com"))!);
			await setGrant(
				fixture.database,
				fixture.admin,
				{ mailboxId: mailbox.id, userId: member.id },
				false,
			);
			await expect(requireMailbox(fixture.database, member, mailbox.id)).resolves.toBeTruthy();
			await changeMember(
				fixture.database,
				fixture.admin,
				{ orgId: organization.id, userId: member.id },
				"remove",
			);
			await expect(requireMailbox(fixture.database, member, mailbox.id)).rejects.toThrow(
				"do not have access",
			);
		} finally {
			fixture.database.close();
		}
	});
	it("forces temporary-password replacement and stores no plaintext passwords", async () => {
		const fixture = await createTestFixture();

		try {
			const { organization } = await createTestMailbox(fixture);
			await createMember(fixture.database, fixture.admin, {
				orgId: organization.id,
				name: "Sam",
				email: "sam@example.com",
				password: testPassword,
				role: "member",
			});
			const login = await fixture.invokeRpc(
				"auth.login",
				{ email: "sam@example.com", password: testPassword },
				{ token: "" },
			);
			expect(login.body.error).toBeUndefined();
			const cookie = login.response.headers
				.get("set-cookie")
				?.match(/flaremail_session=([^;]+)/)?.[1];
			expect(cookie).toBeTruthy();
			const blocked = await fixture.invokeRpc(
				"workspace.list",
				{},
				{ endpoint: "queries", token: cookie },
			);
			expect(blocked.body.error?.data?.kind).toBe("FORBIDDEN");
			const changed = await fixture.invokeRpc(
				"auth.changePassword",
				{ currentPassword: testPassword, password: "a-new-test-password-only" },
				{ token: cookie },
			);
			expect(changed.body.error).toBeUndefined();
			const allowed = await fixture.invokeRpc(
				"workspace.list",
				{},
				{ endpoint: "queries", token: cookie },
			);
			expect(allowed.body.error).toBeUndefined();
			const record = await findUserByEmail(fixture.database, "sam@example.com");
			expect(record!.password_hash).not.toContain("password");
			expect(String(record!.password_hash)).toStartWith("scrypt$");
		} finally {
			fixture.database.close();
		}
	});
	it("keeps drafts and draft attachments private even among shared-mailbox members", async () => {
		const fixture = await createTestFixture();

		try {
			const { organization, mailbox } = await createTestMailbox(fixture);
			await createMember(fixture.database, fixture.admin, {
				orgId: organization.id,
				name: "Casey",
				email: "casey@example.com",
				password: testPassword,
				role: "member",
			});
			const otherMember = mapUserRecord(
				(await findUserByEmail(fixture.database, "casey@example.com"))!,
			);
			await setGrant(
				fixture.database,
				fixture.admin,
				{ mailboxId: mailbox.id, userId: otherMember.id },
				false,
			);
			const draft = await saveDraft(fixture.database, fixture.admin, createEmptyDraft(mailbox.id));
			const attachment = await beginUpload(fixture.database, fixture.admin, {
				mailboxId: mailbox.id,
				draftId: draft.id,
				filename: "private.txt",
				contentType: "text/plain",
				size: 0,
			});
			expect(await listDrafts(fixture.database, otherMember, mailbox.id)).toHaveLength(0);
			await expect(
				getDraft(fixture.database, otherMember, { mailboxId: mailbox.id, id: draft.id }),
			).rejects.toThrow("Draft not found");
			await expect(
				downloadChunk(fixture.database, otherMember, {
					mailboxId: mailbox.id,
					blobId: attachment.id,
					index: 0,
				}),
			).rejects.toThrow("Attachment not found");
		} finally {
			fixture.database.close();
		}
	});
});
