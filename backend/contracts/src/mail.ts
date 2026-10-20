import { z } from "zod";
import { id } from "./identity.ts";
export const CHUNK_SIZE = 256 * 1024;
export const MAX_MESSAGE_SIZE = 5 * 1024 * 1024;
export const attachmentSchema = z.object({
	id,
	filename: z.string(),
	contentType: z.string(),
	size: z.number(),
	contentId: z.string().nullable(),
});
export const labelSchema = z.object({ id, name: z.string(), color: z.string() });
export const folderSchema = z.enum(["inbox", "starred", "sent", "archive", "trash", "all"]);
export type Folder = z.infer<typeof folderSchema>;
export const messageSummarySchema = z.object({
	id,
	threadId: id,
	subject: z.string(),
	sender: z.string(),
	senderName: z.string(),
	snippet: z.string(),
	recipients: z.array(z.string()),
	direction: z.enum(["inbound", "outbound"]),
	receivedAt: z.number(),
	unread: z.boolean(),
	starred: z.boolean(),
	folder: z.string(),
	attachmentCount: z.number(),
	count: z.number(),
	labels: z.array(labelSchema),
});
export const messageSchema = z.object({
	id,
	threadId: id,
	subject: z.string(),
	sender: z.string(),
	senderName: z.string(),
	to: z.array(z.string()),
	cc: z.array(z.string()),
	bcc: z.array(z.string()),
	replyTo: z.string(),
	text: z.string(),
	html: z.string(),
	receivedAt: z.number(),
	direction: z.enum(["inbound", "outbound"]),
	messageId: z.string(),
	attachments: z.array(attachmentSchema),
	rawBlobId: z.string().nullable(),
});
const MAX_BODY_LENGTH = 1024 * 1024;
export const draftInputSchema = z.object({
	id,
	mailboxId: id,
	version: z.number().int().min(0),
	to: z.array(z.string().max(254)).max(50),
	cc: z.array(z.string().max(254)).max(50),
	bcc: z.array(z.string().max(254)).max(50),
	subject: z.string().max(998),
	html: z.string().max(MAX_BODY_LENGTH),
	text: z.string().max(MAX_BODY_LENGTH),
	replyToMessageId: z.string().nullable(),
	attachmentIds: z.array(id).max(32),
});
export const draftSchema = draftInputSchema.extend({
	updatedAt: z.number(),
	sendStatus: z.enum(["pending", "sent", "failed", "unknown"]).nullable(),
	sendError: z.string().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;
export type Label = z.infer<typeof labelSchema>;
export type MessageSummary = z.infer<typeof messageSummarySchema>;
export type Message = z.infer<typeof messageSchema>;
export type DraftInput = z.infer<typeof draftInputSchema>;
export type Draft = z.infer<typeof draftSchema>;
