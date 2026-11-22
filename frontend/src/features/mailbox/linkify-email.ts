export type LinkedPart =
	| { kind: "text"; value: string }
	| { kind: "link"; href: string; value: string };

const LINK_SOURCE = String.raw`https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`;
const LINK_PATTERN = new RegExp(LINK_SOURCE, "i");

function createLinkMatcher() {
	return new RegExp(LINK_SOURCE, "gi");
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function splitTrailingPunctuation(value: string) {
	let end = value.length;

	while (end > 0) {
		const lastCharacter = value[end - 1] ?? "";

		if (!/[.,;:!?]/u.test(lastCharacter)) {
			break;
		}

		end -= 1;
	}

	while (end > 0) {
		const lastCharacter = value[end - 1] ?? "";
		const openingParen = value.slice(0, end).includes("(");

		if (lastCharacter !== ")" || openingParen) {
			break;
		}

		end -= 1;
	}

	return { core: value.slice(0, end), trailing: value.slice(end) };
}

function readSafeHref(token: string) {
	if (token.includes("@") && !token.includes("://") && !token.toLowerCase().startsWith("www.")) {
		return `mailto:${token}`;
	}

	const href = token.toLowerCase().startsWith("www.") ? `https://${token}` : token;

	try {
		const url = new URL(href);

		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}

		return href;
	} catch {
		return null;
	}
}

export function splitLinkedText(text: string): LinkedPart[] {
	const parts: LinkedPart[] = [];
	const matcher = createLinkMatcher();
	let cursor = 0;
	let match = matcher.exec(text);

	while (match) {
		const raw = match[0];
		const start = match.index;
		const { core, trailing } = splitTrailingPunctuation(raw);

		if (start > cursor) {
			parts.push({ kind: "text", value: text.slice(cursor, start) });
		}

		const href = core ? readSafeHref(core) : null;

		if (href) {
			parts.push({ kind: "link", href, value: core });
		} else if (core) {
			parts.push({ kind: "text", value: core });
		}

		if (trailing) {
			parts.push({ kind: "text", value: trailing });
		}

		cursor = start + raw.length;
		match = matcher.exec(text);
	}

	if (cursor < text.length) {
		parts.push({ kind: "text", value: text.slice(cursor) });
	}

	return parts.length > 0 ? parts : [{ kind: "text", value: text }];
}

export function linkifyPlainText(text: string) {
	return splitLinkedText(text)
		.map((part) =>
			part.kind === "link"
				? `<a href="${escapeHtml(part.href)}">${escapeHtml(part.value)}</a>`
				: escapeHtml(part.value),
		)
		.join("");
}

export function linkifyHtmlDocument(document: Document) {
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;

			if (!parent || parent.closest("a, pre, code")) {
				return NodeFilter.FILTER_REJECT;
			}

			const textContent = node.textContent ?? "";
			return LINK_PATTERN.test(textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
		},
	});
	const textNodes: Text[] = [];
	let node = walker.nextNode();

	while (node) {
		textNodes.push(node as Text);
		node = walker.nextNode();
	}

	for (const textNode of textNodes) {
		const textContent = textNode.textContent ?? "";
		const parts = splitLinkedText(textContent);

		if (parts.every((part) => part.kind === "text")) {
			continue;
		}

		const fragment = document.createDocumentFragment();

		for (const part of parts) {
			if (part.kind === "text") {
				fragment.append(document.createTextNode(part.value));
				continue;
			}

			const link = document.createElement("a");
			link.href = part.href;
			link.textContent = part.value;
			fragment.append(link);
		}

		textNode.replaceWith(fragment);
	}
}
