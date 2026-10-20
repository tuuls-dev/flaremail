import { AppError, email } from "@flaremail/contracts";
import type { Database } from "../../platform/database/client";
import { ingestEmail } from "../../modules/mail/index";

export async function receiveInboundEmail(request: Request, database: Database) {
	const sender = request.headers.get("X-Envelope-From") ?? "";
	const recipient = email.safeParse(request.headers.get("X-Envelope-To"));

	if (!recipient.success || sender.length > 254 || /[\r\n]/.test(sender)) {
		return Response.json({ error: "Valid envelope metadata is required." }, { status: 400 });
	}

	try {
		const rawEmail = new Uint8Array(await request.arrayBuffer());
		const result = await ingestEmail(database, rawEmail, { from: sender, to: recipient.data });
		return Response.json(result);
	} catch (error) {
		if (error instanceof AppError) {
			const status = error.kind === "NOT_FOUND" ? 404 : 400;
			return Response.json({ error: error.message }, { status });
		}

		throw error;
	}
}
