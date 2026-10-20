import { logEvent } from "../observability/log";
export type OutgoingEmail = {
	from: string;
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	html: string;
	text: string;
	headers: Record<string, string>;
	attachments: OutgoingAttachment[];
};
export type OutgoingAttachment = { filename: string; content: string; type: string } & (
	| { disposition: "attachment"; contentId?: never }
	| { disposition: "inline"; contentId: string }
);
export interface Sender {
	send(message: OutgoingEmail): Promise<{ messageId: string }>;
}

export function createSender(environment: BackendEnv): Sender {
	if (environment.SEND_MODE === "simulate") {
		return {
			async send() {
				const messageId = `<${crypto.randomUUID()}@simulated.flaremail>`;
				logEvent("email.simulated", { messageId });
				return { messageId };
			},
		};
	}

	if (environment.SEND_MODE !== "live") {
		throw new Error("SEND_MODE must be simulate or live.");
	}

	return {
		async send(message) {
			return environment.EMAIL.send(message);
		},
	};
}

export function encodeBase64(bytes: Uint8Array) {
	let binary = "";

	for (let offset = 0; offset < bytes.length; offset += 8192) {
		const chunkEnd = offset + 8192;
		binary += String.fromCharCode(...bytes.subarray(offset, chunkEnd));
	}

	return btoa(binary);
}
