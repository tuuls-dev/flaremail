/* eslint-disable no-await-in-loop -- Upload attachment chunks sequentially and stop immediately on failure. */
import { CHUNK_SIZE, MAX_MESSAGE_SIZE } from "@flaremail/contracts";
import type { DraftInput, Draft, Attachment } from "@flaremail/contracts";
import { mutate, query, describeError } from "../../sdk/client";
export class ComposeModel {
	readonly id: string;
	readonly mailboxId: string;
	readonly replyToMessageId: string | null;
	version = 0;
	toText = $state("");
	ccText = $state("");
	bccText = $state("");
	subject = $state("");
	html = $state("");
	text = $state("");
	attachments = $state<Attachment[]>([]);
	attachmentIds = $state<string[]>([]);
	saveStatus = $state<"unsaved" | "saving" | "saved" | "error">("unsaved");
	errorMessage = $state("");
	sending = $state(false);
	uploading = $state(false);
	uploadProgress = $state("");
	locked = $state(false);
	private savedSignature = "";
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private savePromise: Promise<Draft> | null = null;
	private lastSavedDraft: Draft | null = null;
	constructor(initialDraft: DraftInput, sendStatus?: Draft["sendStatus"]) {
		this.id = initialDraft.id;
		this.mailboxId = initialDraft.mailboxId;
		this.replyToMessageId = initialDraft.replyToMessageId;
		this.version = initialDraft.version;
		this.toText = initialDraft.to.join(", ");
		this.ccText = initialDraft.cc.join(", ");
		this.bccText = initialDraft.bcc.join(", ");
		this.subject = initialDraft.subject;
		this.html = initialDraft.html;
		this.text = initialDraft.text;
		this.attachmentIds = initialDraft.attachmentIds;
		this.locked = sendStatus === "pending" || sendStatus === "unknown";

		if (this.locked) {
			this.errorMessage =
				"This draft has an unresolved send attempt. Check provider delivery logs before sending a new message.";
		}
	}
	describeContent() {
		return JSON.stringify([
			this.toText,
			this.ccText,
			this.bccText,
			this.subject,
			this.html,
			this.text,
			this.attachmentIds,
		]);
	}
	buildDraft(): DraftInput {
		return {
			id: this.id,
			mailboxId: this.mailboxId,
			version: this.version,
			to: parseRecipients(this.toText),
			cc: parseRecipients(this.ccText),
			bcc: parseRecipients(this.bccText),
			subject: this.subject,
			html: this.html,
			text: this.text,
			replyToMessageId: this.replyToMessageId,
			attachmentIds: this.attachmentIds,
		};
	}
	scheduleSave(signature: string) {
		if (this.locked || this.sending || signature === this.savedSignature) {
			return;
		}

		this.saveStatus = "unsaved";

		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}

		this.saveTimer = setTimeout(() => {
			void this.save().catch(() => {});
		}, 900);
	}
	async loadAttachmentDetails() {
		const attachmentDetails = await Promise.all(
			this.attachmentIds.map(async (blobId) => {
				const metadata = await query("attachments.chunk", {
					mailboxId: this.mailboxId,
					blobId,
					index: 0,
				});
				return {
					id: blobId,
					filename: metadata.filename,
					contentType: metadata.contentType,
					size: metadata.size,
					contentId: null,
				};
			}),
		);
		this.attachments = attachmentDetails;
	}
	async save(): Promise<Draft> {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}

		if (this.locked) {
			throw new Error(this.errorMessage);
		}

		if (this.savePromise) {
			await this.savePromise;
		}

		const signature = this.describeContent();

		if (signature === this.savedSignature && this.lastSavedDraft) {
			return this.lastSavedDraft;
		}

		this.saveStatus = "saving";
		this.savePromise = this.persistDraft(signature);

		try {
			return await this.savePromise;
		} finally {
			this.savePromise = null;
		}
	}
	private async persistDraft(signature: string) {
		try {
			const draft = await mutate("drafts.save", this.buildDraft());
			this.version = draft.version;
			this.lastSavedDraft = draft;
			this.savedSignature = signature;
			this.saveStatus = this.describeContent() === signature ? "saved" : "unsaved";
			this.errorMessage = "";
			return draft;
		} catch (error) {
			this.saveStatus = "error";
			this.errorMessage = describeError(error);
			throw error;
		}
	}
	async copyForwardedAttachments(attachments: Attachment[]) {
		this.uploading = true;

		try {
			await this.save();

			for (const attachment of attachments) {
				const copied = await mutate("attachments.copy", {
					mailboxId: this.mailboxId,
					draftId: this.id,
					attachmentId: attachment.id,
				});
				this.attachmentIds = this.attachmentIds.concat(copied.id);
				this.attachments = this.attachments.concat(copied);
			}

			await this.save();
		} catch (error) {
			this.errorMessage = describeError(error);
		} finally {
			this.uploading = false;
		}
	}
	async uploadFiles(files: FileList | File[]) {
		const selectedFiles = Array.from(files);
		this.uploading = true;

		try {
			await this.save();

			for (const file of selectedFiles) {
				await this.uploadFile(file);
			}

			await this.save();
		} catch (error) {
			this.errorMessage = describeError(error);
		} finally {
			this.uploading = false;
			this.uploadProgress = "";
		}
	}
	private async uploadFile(file: File) {
		if (this.attachmentIds.length >= 32) {
			throw new Error("A message may have at most 32 attachments.");
		}

		const totalSize =
			this.attachments.reduce((size, attachment) => size + attachment.size, 0) + file.size;

		if (totalSize > MAX_MESSAGE_SIZE * 0.7) {
			throw new Error("Attachments leave too little room within the 5 MiB encoded message limit.");
		}

		const attachment = await mutate("attachments.begin", {
			mailboxId: this.mailboxId,
			draftId: this.id,
			filename: file.name,
			contentType: file.type || "application/octet-stream",
			size: file.size,
		});

		for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
			const chunkEnd = offset + CHUNK_SIZE;
			const bytes = new Uint8Array(await file.slice(offset, chunkEnd).arrayBuffer());
			await mutate("attachments.upload", {
				mailboxId: this.mailboxId,
				id: attachment.id,
				index: offset / CHUNK_SIZE,
				bytes,
			});
			const completed = Math.min(chunkEnd, file.size);
			const completedPercent = (completed / file.size) * 100;
			this.uploadProgress = `${file.name} · ${Math.round(completedPercent)}%`;
		}

		this.attachmentIds = this.attachmentIds.concat(attachment.id);
		this.attachments = this.attachments.concat(attachment);
	}
	removeAttachment(attachmentId: string) {
		this.attachmentIds = this.attachmentIds.filter((id) => id !== attachmentId);
		this.attachments = this.attachments.filter((attachment) => attachment.id !== attachmentId);
	}
	async send() {
		this.sending = true;
		this.errorMessage = "";

		try {
			const draft = await this.save();
			const result = await mutate("mail.send", {
				mailboxId: this.mailboxId,
				draftId: this.id,
				version: draft.version,
				idempotencyKey: crypto.randomUUID(),
			});

			if (result.status !== "sent") {
				this.locked = result.status === "pending" || result.status === "unknown";
				this.errorMessage = result.error ?? "This message is still being processed.";
				return false;
			}

			return true;
		} catch (error) {
			this.errorMessage = describeError(error);

			if (error instanceof TypeError) {
				this.locked = true;
				this.errorMessage =
					"Connection lost during sending. Reopen this draft to check its status before trying again.";
			}

			return false;
		} finally {
			this.sending = false;
		}
	}
	async discard() {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}

		if (this.savePromise) {
			await this.savePromise;
		}

		await mutate("drafts.discard", {
			mailboxId: this.mailboxId,
			id: this.id,
			version: this.version,
		});
	}
	destroy() {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
	}
}

function parseRecipients(value: string) {
	return value
		.split(/[,;\n]/)
		.map((address) => address.trim())
		.filter(Boolean);
}
