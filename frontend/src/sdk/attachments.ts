/* eslint-disable no-await-in-loop -- Fetch binary chunks sequentially to bound memory and avoid flooding the Worker. */
import { CHUNK_SIZE } from "@flaremail/contracts";
import { query } from "./client";

export async function readAttachment(mailboxId: string, blobId: string) {
	const firstChunk = await query("attachments.chunk", { mailboxId, blobId, index: 0 });
	const content = new Uint8Array(firstChunk.size);
	content.set(firstChunk.bytes);

	for (let offset = CHUNK_SIZE; offset < firstChunk.size; offset += CHUNK_SIZE) {
		const chunk = await query("attachments.chunk", {
			mailboxId,
			blobId,
			index: offset / CHUNK_SIZE,
		});
		content.set(chunk.bytes, offset);
	}

	return { bytes: content, filename: firstChunk.filename, contentType: firstChunk.contentType };
}

export async function downloadAttachment(mailboxId: string, blobId: string) {
	const attachment = await readAttachment(mailboxId, blobId);
	const file = new Blob([attachment.bytes], { type: attachment.contentType });
	const objectUrl = URL.createObjectURL(file);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = attachment.filename;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function formatFileSize(size: number) {
	if (size < 1024) {
		return `${size} B`;
	}

	const sizeInKilobytes = size / 1024;

	if (size < 1024 * 1024) {
		return `${Math.round(sizeInKilobytes)} KB`;
	}

	return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
