/* eslint-disable no-await-in-loop -- JSON-RPC batch operations run in order so state-changing operations cannot race one another. */
import { AppError, queries, mutations, rpcRequestSchema } from "@flaremail/contracts";
import type { RpcResponse, RpcRequest } from "@flaremail/contracts";
import { ZodError } from "zod";
import { Encoder, Decoder } from "cbor-x";
import type { RequestContext } from "./context";
import { methodRegistry } from "./methods";
import { requireUser } from "../../modules/identity/index";
import { resolveSessionUser } from "../../modules/identity/index";
import { logEvent } from "../../platform/observability/log";
const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ mapsAsObjects: true });
const publicMethods = new Set([
	"instance.status",
	"instance.setup",
	"auth.login",
	"auth.session",
	"auth.logout",
]);
const passwordChangeMethods = new Set(["auth.changePassword", "auth.session", "auth.logout"]);

function createErrorResponse(
	id: RpcResponse["id"],
	code: number,
	message: string,
	kind?: string,
): RpcResponse {
	if (kind) {
		return { jsonrpc: "2.0", id, error: { code, message, data: { kind } } };
	}

	return { jsonrpc: "2.0", id, error: { code, message } };
}

function mapApplicationError(error: unknown, id: RpcResponse["id"]): RpcResponse {
	if (error instanceof ZodError) {
		const validationMessage = error.issues[0]?.message ?? "Invalid parameters";
		return createErrorResponse(id, -32602, validationMessage, "VALIDATION");
	}

	if (error instanceof AppError) {
		return createErrorResponse(id, -32000, error.message, error.kind);
	}

	if (
		error instanceof Error &&
		"code" in error &&
		String(error.code).startsWith("SQLITE_CONSTRAINT")
	) {
		return createErrorResponse(
			id,
			-32000,
			"This record already exists or is still in use.",
			"CONFLICT",
		);
	}

	logEvent("rpc.error", { errorType: error instanceof Error ? error.name : "unknown" });
	return createErrorResponse(id, -32603, "Something went wrong. Please try again.");
}

async function authorizeMethod(context: RequestContext, methodName: string) {
	context.user = await resolveSessionUser(context.database, context.sessionToken);

	if (publicMethods.has(methodName)) {
		return;
	}

	requireUser(context.user);

	if (context.user.mustChangePassword && !passwordChangeMethods.has(methodName)) {
		throw new AppError("FORBIDDEN", "Change your temporary password before continuing.");
	}
}

async function executeRequest(
	value: unknown,
	endpoint: "queries" | "mutations",
	context: RequestContext,
): Promise<RpcResponse | null> {
	const parsedRequest = rpcRequestSchema.safeParse(value);

	if (!parsedRequest.success) {
		return createErrorResponse(null, -32600, "Invalid Request");
	}

	const request = parsedRequest.data;
	const requestId = request.id ?? null;
	const allowedMethods = endpoint === "queries" ? queries : mutations;
	const handler = methodRegistry.get(request.method);

	if (!Object.hasOwn(allowedMethods, request.method) || !handler) {
		return respondUnlessNotification(
			request,
			createErrorResponse(requestId, -32601, "Method not found"),
		);
	}

	try {
		await authorizeMethod(context, request.method);
		const result = await handler.execute(context, request.params);
		return respondUnlessNotification(request, { jsonrpc: "2.0", id: request.id ?? null, result });
	} catch (error) {
		return respondUnlessNotification(request, mapApplicationError(error, requestId));
	}
}

function respondUnlessNotification(request: RpcRequest, response: RpcResponse) {
	return request.id === undefined ? null : response;
}

export function encodeResponse(value: RpcResponse | RpcResponse[], status = 200) {
	return new Response(new Uint8Array(encoder.encode(value)), {
		status,
		headers: { "Content-Type": "application/cbor", "Cache-Control": "no-store" },
	});
}

export async function dispatchRpc(
	body: ArrayBuffer,
	endpoint: "queries" | "mutations",
	context: RequestContext,
) {
	let decodedBody: unknown;

	try {
		decodedBody = decoder.decode(new Uint8Array(body));
	} catch {
		return encodeResponse(createErrorResponse(null, -32700, "Parse error"));
	}

	if (!Array.isArray(decodedBody)) {
		const response = await executeRequest(decodedBody, endpoint, context);
		return response ? encodeResponse(response) : new Response(null, { status: 204 });
	}

	if (!decodedBody.length || decodedBody.length > 50) {
		return encodeResponse(
			createErrorResponse(null, -32600, "Batch must contain between 1 and 50 requests"),
		);
	}

	const responses: RpcResponse[] = [];

	for (const request of decodedBody) {
		const response = await executeRequest(request, endpoint, context);

		if (response) {
			responses.push(response);
		}
	}

	return responses.length ? encodeResponse(responses) : new Response(null, { status: 204 });
}
