import { strict as assert } from "node:assert";
import { Encoder, Decoder } from "cbor-x";
import type { RpcResponse } from "@flaremail/contracts";
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ mapsAsObjects: true });

async function sendQuery(value: unknown) {
	return fetch(`${origin}/api/queries`, {
		method: "POST",
		headers: { "Content-Type": "application/cbor", Origin: origin },
		body: new Uint8Array(encoder.encode(value)),
	});
}

const statusResponse = await sendQuery({
	jsonrpc: "2.0",
	id: 1,
	method: "instance.status",
	params: {},
});
assert.equal(statusResponse.headers.get("Content-Type"), "application/cbor");
assert.equal(statusResponse.headers.get("Cache-Control"), "no-store");
const status = decoder.decode(new Uint8Array(await statusResponse.arrayBuffer())) as RpcResponse;
assert.equal(status.id, 1);
assert.equal(typeof (status.result as { initialized: boolean }).initialized, "boolean");
const sessionResponse = await sendQuery({
	jsonrpc: "2.0",
	id: 2,
	method: "auth.session",
	params: {},
});
const session = decoder.decode(new Uint8Array(await sessionResponse.arrayBuffer())) as RpcResponse;
assert.equal(session.result, null);
const notification = await sendQuery({ jsonrpc: "2.0", method: "instance.status", params: {} });
assert.equal(notification.status, 204);
const endpointSeparation = await sendQuery({
	jsonrpc: "2.0",
	id: 3,
	method: "organizations.create",
	params: { name: "must-not-create" },
});
const blocked = decoder.decode(
	new Uint8Array(await endpointSeparation.arrayBuffer()),
) as RpcResponse;
assert.equal(blocked.error?.code, -32601);
console.log(
	"Worker runtime smoke checks passed: CBOR, no-store, sessions, notifications, and read/write endpoint separation. No data was changed.",
);
