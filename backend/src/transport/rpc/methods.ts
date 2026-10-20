import { methods } from "@flaremail/contracts";
import type { MethodName, ParsedParams, Result } from "@flaremail/contracts";
import type { RequestContext } from "./context";
import {
	readInstanceStatus,
	completeInstanceSetup,
	authenticateUser,
	endSession,
	changePassword,
} from "../../modules/identity/index";
import { requireUser } from "../../modules/identity/index";
import {
	listWorkspace,
	createOrganization,
	renameOrganization,
	createMember,
	addMember,
	changeMember,
	resetPassword,
} from "../../modules/organizations/index";
import { readOrganizationOverview } from "../../modules/organizations/index";
import { createDomain, updateDomain } from "../../modules/domains/index";
import {
	createMailbox,
	updateMailbox,
	listMailboxGrants,
	setGrant,
} from "../../modules/mailboxes/index";
import {
	listMail,
	readThread,
	countMailboxMessages,
	listLabels,
	updateMail,
	restoreMessageFolders,
	labelMail,
	createLabel,
	removeLabel,
} from "../../modules/mail/index";
import { getDraft, listDrafts, saveDraft, discardDraft } from "../../modules/mail/index";
import { beginUpload, uploadChunk, downloadChunk, copyAttachment } from "../../modules/mail/index";
import { sendMail } from "../../modules/mail/index";

function bindMethod<K extends MethodName>(
	methodName: K,
	execute: (context: RequestContext, params: ParsedParams<K>) => Promise<Result<K>>,
) {
	return {
		name: methodName,
		async execute(context: RequestContext, params: unknown) {
			const requestParams = params ?? {};
			const parsedParams = methods[methodName].params.parse(requestParams) as ParsedParams<K>;
			return execute(context, parsedParams);
		},
	};
}

const definitions = [
	bindMethod("instance.status", (context) => readInstanceStatus(context.database)),
	bindMethod("instance.setup", (context, params) =>
		completeInstanceSetup(context.database, params, context.setSessionToken),
	),
	bindMethod("auth.session", async (context) => {
		if (!context.user) {
			return null;
		}

		const instance = await readInstanceStatus(context.database);
		return { user: context.user, instanceName: instance.name };
	}),
	bindMethod("auth.login", (context, params) =>
		authenticateUser(context.database, params, context.clientIp, context.setSessionToken),
	),
	bindMethod("auth.logout", async (context) => {
		await endSession(context.database, context.sessionToken);
		context.clearSessionToken();
		return { ok: true };
	}),
	bindMethod("auth.changePassword", (context, params) =>
		changePassword(context.database, context.user, params, context.sessionToken),
	),
	bindMethod("auth.profile", async (context, params) => {
		requireUser(context.user);
		await context.database.execute({
			sql: "UPDATE users SET name=? WHERE id=?",
			args: [params.name, context.user.id],
		});
		return { ok: true };
	}),
	bindMethod("workspace.list", (context) => listWorkspace(context.database, context.user)),
	bindMethod("organizations.create", (context, params) =>
		createOrganization(context.database, context.user, params.name),
	),
	bindMethod("organizations.rename", (context, params) =>
		renameOrganization(context.database, context.user, params.orgId, params.name),
	),
	bindMethod("admin.overview", (context, params) =>
		readOrganizationOverview(context.database, context.user, params.orgId),
	),
	bindMethod("members.create", (context, params) =>
		createMember(context.database, context.user, params),
	),
	bindMethod("members.add", (context, params) => addMember(context.database, context.user, params)),
	bindMethod("members.role", (context, params) =>
		changeMember(context.database, context.user, params, "role"),
	),
	bindMethod("members.disable", (context, params) =>
		changeMember(context.database, context.user, params, "disable"),
	),
	bindMethod("members.remove", (context, params) =>
		changeMember(context.database, context.user, params, "remove"),
	),
	bindMethod("members.resetPassword", (context, params) =>
		resetPassword(context.database, context.user, params),
	),
	bindMethod("domains.create", (context, params) =>
		createDomain(context.database, context.user, params.orgId, params.name),
	),
	bindMethod("domains.ready", (context, params) =>
		updateDomain(context.database, context.user, params),
	),
	bindMethod("domains.remove", (context, params) =>
		updateDomain(context.database, context.user, params, true),
	),
	bindMethod("mailboxes.create", (context, params) =>
		createMailbox(context.database, context.user, params),
	),
	bindMethod("mailboxes.update", (context, params) =>
		updateMailbox(context.database, context.user, params),
	),
	bindMethod("mailboxes.grants", (context, params) =>
		listMailboxGrants(context.database, context.user, params.mailboxId),
	),
	bindMethod("mailboxes.grant", (context, params) =>
		setGrant(context.database, context.user, params, false),
	),
	bindMethod("mailboxes.revoke", (context, params) =>
		setGrant(context.database, context.user, params, true),
	),
	bindMethod("mail.list", (context, params) => listMail(context.database, context.user, params)),
	bindMethod("mail.thread", (context, params) =>
		readThread(context.database, context.user, params),
	),
	bindMethod("mail.counts", (context, params) =>
		countMailboxMessages(context.database, context.user, params.mailboxId),
	),
	bindMethod("labels.list", (context, params) =>
		listLabels(context.database, context.user, params.mailboxId),
	),
	bindMethod("labels.create", (context, params) =>
		createLabel(context.database, context.user, params),
	),
	bindMethod("labels.remove", (context, params) =>
		removeLabel(context.database, context.user, params),
	),
	bindMethod("mail.update", (context, params) =>
		updateMail(context.database, context.user, params),
	),
	bindMethod("mail.restoreFolders", (context, params) =>
		restoreMessageFolders(context.database, context.user, params),
	),
	bindMethod("mail.label", (context, params) => labelMail(context.database, context.user, params)),
	bindMethod("drafts.list", (context, params) =>
		listDrafts(context.database, context.user, params.mailboxId),
	),
	bindMethod("drafts.get", (context, params) => getDraft(context.database, context.user, params)),
	bindMethod("drafts.save", (context, params) => saveDraft(context.database, context.user, params)),
	bindMethod("drafts.discard", (context, params) =>
		discardDraft(context.database, context.user, params),
	),
	bindMethod("attachments.begin", (context, params) =>
		beginUpload(context.database, context.user, params),
	),
	bindMethod("attachments.copy", (context, params) =>
		copyAttachment(context.database, context.user, params),
	),
	bindMethod("attachments.upload", (context, params) =>
		uploadChunk(context.database, context.user, params),
	),
	bindMethod("attachments.chunk", (context, params) =>
		downloadChunk(context.database, context.user, params),
	),
	bindMethod("mail.send", (context, params) =>
		sendMail(context.database, context.user, params, context.sender),
	),
];
export const methodRegistry = new Map(
	definitions.map((definition) => [definition.name as string, definition]),
);
