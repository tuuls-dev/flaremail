import { z } from "zod";
import { id, name, email, password, sessionSchema } from "./identity.ts";
import { organizationSchema, memberSchema, auditSchema } from "./organizations.ts";
import { domainSchema } from "./domains.ts";
import { mailboxSchema, grantSchema } from "./mailboxes.ts";
import {
	attachmentSchema,
	labelSchema,
	folderSchema,
	messageSummarySchema,
	messageSchema,
	draftSchema,
	draftInputSchema,
	CHUNK_SIZE,
	MAX_MESSAGE_SIZE,
} from "./mail.ts";

function defineMethod<P extends z.ZodType, R extends z.ZodType>(params: P, result: R) {
	return { params, result };
}

const empty = z.object({});
const ok = z.object({ ok: z.literal(true) });
const org = z.object({ orgId: id });
const mailbox = z.object({ mailboxId: id });
export const queries = {
	"instance.status": defineMethod(empty, z.object({ initialized: z.boolean(), name: z.string() })),
	"auth.session": defineMethod(empty, sessionSchema.nullable()),
	"workspace.list": defineMethod(
		empty,
		z.object({ organizations: z.array(organizationSchema), mailboxes: z.array(mailboxSchema) }),
	),
	"admin.overview": defineMethod(
		org,
		z.object({
			domains: z.array(domainSchema),
			members: z.array(memberSchema),
			mailboxes: z.array(mailboxSchema),
			audit: z.array(auditSchema),
		}),
	),
	"mailboxes.grants": defineMethod(mailbox, z.array(grantSchema)),
	"mail.list": defineMethod(
		z.object({
			mailboxId: id,
			folder: folderSchema,
			search: z.string().max(500).default(""),
			labelId: id.optional(),
			offset: z.number().int().min(0).max(100000).default(0),
		}),
		z.object({ items: z.array(messageSummarySchema), total: z.number() }),
	),
	"mail.thread": defineMethod(z.object({ mailboxId: id, threadId: id }), z.array(messageSchema)),
	"mail.counts": defineMethod(
		mailbox,
		z.object({
			inbox: z.number(),
			unread: z.number(),
			drafts: z.number(),
			starred: z.number(),
			sent: z.number(),
			trash: z.number(),
		}),
	),
	"labels.list": defineMethod(mailbox, z.array(labelSchema)),
	"drafts.list": defineMethod(mailbox, z.array(draftSchema)),
	"drafts.get": defineMethod(z.object({ mailboxId: id, id }), draftSchema),
	"attachments.chunk": defineMethod(
		z.object({ mailboxId: id, blobId: id, index: z.number().int().min(0) }),
		z.object({
			bytes: z.instanceof(Uint8Array),
			size: z.number(),
			filename: z.string(),
			contentType: z.string(),
		}),
	),
} as const;
export const mutations = {
	"instance.setup": defineMethod(
		z.object({ instanceName: name, name, email, password }),
		sessionSchema,
	),
	"auth.login": defineMethod(
		z.object({ email, password: z.string().min(1).max(128) }),
		sessionSchema,
	),
	"auth.logout": defineMethod(empty, ok),
	"auth.changePassword": defineMethod(
		z.object({ currentPassword: z.string().max(128), password }),
		ok,
	),
	"auth.profile": defineMethod(z.object({ name }), ok),
	"organizations.create": defineMethod(z.object({ name }), organizationSchema),
	"organizations.rename": defineMethod(z.object({ orgId: id, name }), ok),
	"members.create": defineMethod(
		z.object({ orgId: id, name, email, password, role: z.enum(["admin", "member"]) }),
		ok,
	),
	"members.add": defineMethod(
		z.object({ orgId: id, email, role: z.enum(["admin", "member"]) }),
		ok,
	),
	"members.role": defineMethod(
		z.object({ orgId: id, userId: id, role: z.enum(["admin", "member"]) }),
		ok,
	),
	"members.remove": defineMethod(z.object({ orgId: id, userId: id }), ok),
	"members.resetPassword": defineMethod(z.object({ orgId: id, userId: id, password }), ok),
	"members.disable": defineMethod(z.object({ orgId: id, userId: id, disabled: z.boolean() }), ok),
	"domains.create": defineMethod(
		z.object({
			orgId: id,
			name: z
				.string()
				.trim()
				.toLowerCase()
				.regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/)
				.max(253),
		}),
		domainSchema,
	),
	"domains.ready": defineMethod(z.object({ orgId: id, id, ready: z.boolean() }), ok),
	"domains.remove": defineMethod(z.object({ orgId: id, id }), ok),
	"mailboxes.create": defineMethod(
		z.object({
			orgId: id,
			domainId: id,
			localPart: z
				.string()
				.toLowerCase()
				.regex(/^[a-z0-9][a-z0-9._+-]{0,63}$/),
			name,
		}),
		mailboxSchema,
	),
	"mailboxes.update": defineMethod(z.object({ mailboxId: id, name, disabled: z.boolean() }), ok),
	"mailboxes.grant": defineMethod(z.object({ mailboxId: id, userId: id }), ok),
	"mailboxes.revoke": defineMethod(z.object({ mailboxId: id, userId: id }), ok),
	"mail.update": defineMethod(
		z.object({
			mailboxId: id,
			threadIds: z.array(id).min(1).max(100),
			unread: z.boolean().optional(),
			starred: z.boolean().optional(),
			folder: z.enum(["inbox", "archive", "trash", "sent"]).optional(),
		}),
		z.object({
			ok: z.literal(true),
			previousFolders: z.array(
				z.object({ id, folder: z.enum(["inbox", "archive", "trash", "sent"]) }),
			),
		}),
	),
	"mail.restoreFolders": defineMethod(
		z.object({
			mailboxId: id,
			states: z
				.array(z.object({ id, folder: z.enum(["inbox", "archive", "trash", "sent"]) }))
				.max(10000),
		}),
		ok,
	),
	"mail.label": defineMethod(
		z.object({
			mailboxId: id,
			threadIds: z.array(id).min(1).max(100),
			labelId: id,
			remove: z.boolean(),
		}),
		ok,
	),
	"labels.create": defineMethod(
		z.object({ mailboxId: id, name, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
		labelSchema,
	),
	"labels.remove": defineMethod(z.object({ mailboxId: id, id }), ok),
	"drafts.save": defineMethod(draftInputSchema, draftSchema),
	"drafts.discard": defineMethod(
		z.object({ mailboxId: id, id, version: z.number().int().min(0) }),
		ok,
	),
	"attachments.begin": defineMethod(
		z.object({
			mailboxId: id,
			draftId: id,
			filename: z.string().min(1).max(255),
			contentType: z.string().max(255),
			size: z.number().int().min(0).max(MAX_MESSAGE_SIZE),
		}),
		attachmentSchema,
	),
	"attachments.copy": defineMethod(
		z.object({ mailboxId: id, draftId: id, attachmentId: id }),
		attachmentSchema,
	),
	"attachments.upload": defineMethod(
		z.object({
			mailboxId: id,
			id,
			index: z.number().int().min(0).max(20),
			bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.length <= CHUNK_SIZE),
		}),
		ok,
	),
	"mail.send": defineMethod(
		z.object({
			mailboxId: id,
			draftId: id,
			version: z.number().int().min(1),
			idempotencyKey: z.uuid(),
		}),
		z.object({
			status: z.enum(["pending", "sent", "failed", "unknown"]),
			messageId: z.string().nullable(),
			error: z.string().nullable(),
		}),
	),
} as const;
export type QueryName = keyof typeof queries;
export type MutationName = keyof typeof mutations;
export type MethodName = QueryName | MutationName;
export const methods = Object.assign({}, queries, mutations);
export type Params<K extends MethodName> = z.input<(typeof methods)[K]["params"]>;
export type ParsedParams<K extends MethodName> = z.output<(typeof methods)[K]["params"]>;
export type Result<K extends MethodName> = z.output<(typeof methods)[K]["result"]>;
export const rpcRequestSchema = z.object({
	jsonrpc: z.literal("2.0"),
	id: z.union([z.string().max(100), z.number().finite(), z.null()]).optional(),
	method: z.string().max(100),
	params: z.unknown().optional(),
});
export type RpcRequest = z.infer<typeof rpcRequestSchema>;
export type RpcResponse = {
	jsonrpc: "2.0";
	id: string | number | null;
	result?: unknown;
	error?: { code: number; message: string; data?: { kind: string } };
};
export type AppErrorKind =
	| "UNAUTHORIZED"
	| "FORBIDDEN"
	| "NOT_FOUND"
	| "CONFLICT"
	| "VALIDATION"
	| "RATE_LIMITED"
	| "SETUP_COMPLETE";
export class AppError extends Error {
	readonly kind: AppErrorKind;
	constructor(kind: AppErrorKind, message: string) {
		super(message);
		this.kind = kind;
	}
}
