import { Encoder, Decoder } from "cbor-x";
import { methods } from "@flaremail/contracts";
import type {
	Params,
	Result,
	QueryName,
	MutationName,
	MethodName,
	RpcResponse,
} from "@flaremail/contracts";
const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ mapsAsObjects: true });
export class RpcError extends Error {
	constructor(
		message: string,
		public kind: string,
		public code: number,
	) {
		super(message);
	}
}

async function executeRpc<K extends MethodName>(
	endpoint: "queries" | "mutations",
	methodName: K,
	params: Params<K>,
	signal?: AbortSignal,
): Promise<Result<K>> {
	const requestId = crypto.randomUUID();
	const encodedRequest = encoder.encode({
		jsonrpc: "2.0",
		id: requestId,
		method: methodName,
		params,
	});
	const response = await fetch(`/api/${endpoint}`, {
		method: "POST",
		credentials: "same-origin",
		headers: { "Content-Type": "application/cbor", Accept: "application/cbor" },
		body: new Uint8Array(encodedRequest),
		signal,
	});

	if (!response.ok) {
		throw createHttpError(response.status);
	}

	const result = decoder.decode(new Uint8Array(await response.arrayBuffer())) as RpcResponse;

	if (result.jsonrpc !== "2.0" || result.id !== requestId) {
		throw new RpcError("The server returned an invalid response.", "PROTOCOL", -32603);
	}

	if (result.error) {
		const kind = result.error.data?.kind ?? "INTERNAL";

		if (kind === "UNAUTHORIZED" && methodName !== "auth.login") {
			window.dispatchEvent(new Event("flaremail:session-expired"));
		}

		throw new RpcError(result.error.message, kind, result.error.code);
	}

	return methods[methodName].result.parse(result.result) as Result<K>;
}

function createHttpError(responseStatus: number) {
	if (responseStatus === 403) {
		return new RpcError(
			"The server rejected this page’s address. Check the application’s allowed origin.",
			"FORBIDDEN",
			responseStatus,
		);
	}

	const message = `Request failed (${responseStatus}). Please try again.`;
	return new RpcError(message, "NETWORK", responseStatus);
}

export function query<K extends QueryName>(methodName: K, params: Params<K>, signal?: AbortSignal) {
	return executeRpc("queries", methodName, params, signal);
}

export function mutate<K extends MutationName>(methodName: K, params: Params<K>) {
	return executeRpc("mutations", methodName, params);
}

export function describeError(error: unknown) {
	return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
