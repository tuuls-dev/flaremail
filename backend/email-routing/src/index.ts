/* eslint-disable no-await-in-loop -- Each delivery retry depends on the preceding HTTP outcome. */
const MAX_RAW_SIZE = 5 * 1024 * 1024;
type InboundMessage = Pick<
	ForwardableEmailMessage,
	"rawSize" | "raw" | "from" | "to" | "setReject"
>;
type SendRequest = (url: string, options: RequestInit) => Promise<Response>;

async function attemptDelivery(
	sendRequest: SendRequest,
	url: string,
	message: InboundMessage,
	rawEmail: ArrayBuffer,
) {
	try {
		const response = await sendRequest(url, {
			method: "POST",
			headers: {
				"Content-Type": "message/rfc822",
				"X-Envelope-From": message.from,
				"X-Envelope-To": message.to,
			},
			body: rawEmail,
			signal: AbortSignal.timeout(15000),
		});
		await response.body?.cancel();
		return response.status;
	} catch {
		return 503;
	}
}

function classifyDelivery(status: number) {
	if (status >= 200 && status < 300) {
		return "accepted";
	}

	if (status === 404) {
		return "unknownRecipient";
	}

	if (status >= 500 || status === 429) {
		return "retry";
	}

	return "rejected";
}

export async function forwardInboundEmail(
	message: InboundMessage,
	environment: RoutingEnv,
	sendRequest: SendRequest = fetch,
) {
	if (message.rawSize > MAX_RAW_SIZE) {
		message.setReject("Message exceeds the 5 MiB application limit.");
		return;
	}

	const rawEmail = await new Response(message.raw).arrayBuffer();

	for (let attempt = 0; attempt < 3; attempt++) {
		const status = await attemptDelivery(sendRequest, environment.INBOUND_URL, message, rawEmail);
		const outcome = classifyDelivery(status);

		if (outcome === "accepted") {
			return;
		}

		if (outcome === "unknownRecipient") {
			message.setReject("Recipient mailbox is not available.");
			return;
		}

		if (outcome === "rejected") {
			message.setReject("Message could not be accepted by this instance.");
			return;
		}

		if (attempt < 2) {
			const retryDelay = 250 * 2 ** attempt;
			await new Promise((resolve) => setTimeout(resolve, retryDelay));
		}
	}

	throw new Error("Inbound ingestion failed after three attempts.");
}

export default {
	async email(message, environment) {
		await forwardInboundEmail(message, environment);
	},
} satisfies ExportedHandler<RoutingEnv>;
