/* eslint-disable no-await-in-loop -- Each ingestion retry depends on the previous attempt. */
import { AppError, email, MAX_MESSAGE_SIZE } from "@flaremail/contracts";
import type { Database } from "../../platform/database/client";
import { ingestEmail } from "../../modules/mail/index";

type InboundEmail = Pick<ForwardableEmailMessage, "from" | "to" | "raw" | "rawSize" | "setReject">;
const maxIngestionAttempts = 3;

export async function receiveInboundEmail(message: InboundEmail, database: Database) {
	if (message.rawSize > MAX_MESSAGE_SIZE) {
		message.setReject("Message exceeds the 5 MiB application limit.");
		return;
	}

	const sender = message.from;
	const recipient = email.safeParse(message.to);

	if (!recipient.success || sender.length > 254 || /[\r\n]/.test(sender)) {
		message.setReject("Valid envelope metadata is required.");
		return;
	}

	const rawEmail = new Uint8Array(await new Response(message.raw).arrayBuffer());
	const envelope = { from: sender, to: recipient.data };

	for (let attempt = 1; attempt <= maxIngestionAttempts; attempt++) {
		try {
			await ingestEmail(database, rawEmail, envelope);
			return;
		} catch (error) {
			if (error instanceof AppError) {
				message.setReject(error.message);
				return;
			}

			if (attempt === maxIngestionAttempts) {
				throw error;
			}

			const retryDelay = 250 * attempt;
			await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
		}
	}
}
