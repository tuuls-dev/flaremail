import { scryptAsync } from "@noble/hashes/scrypt.js";
const options = { N: 16384, r: 8, p: 5, dkLen: 32, maxmem: 32 * 1024 * 1024 };

export function encodeHex(bytes: Uint8Array) {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashSha256(value: Uint8Array | string) {
	const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
	return encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function hashPassword(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await scryptAsync(password, salt, options);
	return `scrypt$${encodeHex(salt)}$${encodeHex(key)}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [algorithm, salt, expected] = stored.split("$");

	if (algorithm !== "scrypt" || !salt || !expected) {
		return false;
	}

	const saltPairs = salt.match(/.{2}/g) ?? [];
	const saltBytes = Uint8Array.from(saltPairs, (value) => parseInt(value, 16));
	const actual = encodeHex(await scryptAsync(password, saltBytes, options));
	let difference = actual.length ^ expected.length;

	for (let i = 0; i < actual.length; i++) {
		difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
	}

	return difference === 0;
}
