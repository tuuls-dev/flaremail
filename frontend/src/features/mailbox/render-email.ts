import { emailStyles } from "@flaremail/contracts";
import DOMPurify from "dompurify";

export function renderEmailDocument(
	html: string,
	loadRemoteImages: boolean,
	inlineImages: Record<string, string>,
) {
	const safeHtml = DOMPurify.sanitize(html, {
		FORBID_TAGS: ["style", "form", "input", "button", "video", "audio", "svg", "math"],
		FORBID_ATTR: ["srcset", "background", "formaction"],
		ADD_ATTR: ["cellpadding", "cellspacing", "bgcolor", "valign"],
	});
	const document = new DOMParser().parseFromString(safeHtml, "text/html");

	filterEmailStyles(document);

	collapseQuotedHistory(document);

	for (const image of document.querySelectorAll("img")) {
		const source = image.getAttribute("src") ?? "";

		if (source.startsWith("cid:")) {
			const inlineUrl = inlineImages[source.slice(4)];

			if (inlineUrl) {
				image.src = inlineUrl;
			} else {
				image.removeAttribute("src");
			}
		} else if (!loadRemoteImages) {
			image.removeAttribute("src");
		}
	}

	for (const link of document.querySelectorAll("a")) {
		link.target = "_blank";
		link.rel = "noopener noreferrer";
	}

	const imagePolicy = loadRemoteImages ? "https: http: blob: data:" : "blob: data:";
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imagePolicy}; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>
html { overflow: hidden; }
body { margin: 0; padding: 2px; display: flow-root; color: #343746; background: white;
font: 13px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow-wrap: anywhere; }
img, table { max-width: 100%; } img { height: auto; }
pre { white-space: pre-wrap; } a { color: #5555db; }
blockquote { margin-left: 12px; border-left: 2px solid #ddd; padding-left: 16px; }
details { margin-top: 12px; } summary { cursor: pointer; color: #687183; }
</style></head><body class="email-document">${document.body.innerHTML}</body></html>`;
}

function collapseQuotedHistory(document: Document) {
	const quoteSelector =
		"blockquote, .gmail_quote, .yahoo_quoted, .protonmail_quote, #divRplyFwdMsg";
	const quotes = Array.from(document.querySelectorAll(quoteSelector));

	for (const quote of quotes) {
		if (quote.parentElement?.closest(quoteSelector)) {
			continue;
		}

		const details = document.createElement("details");
		const summary = document.createElement("summary");
		summary.textContent = "Show quoted history";
		quote.replaceWith(details);
		details.append(summary, quote);

		// Outlook puts its reply separator before the quoted content, not around it.
		if (quote.id === "divRplyFwdMsg") {
			while (details.nextSibling) {
				details.append(details.nextSibling);
			}
		}
	}
}

function filterEmailStyles(document: Document) {
	for (const element of document.querySelectorAll<HTMLElement>("[style]")) {
		for (const property of Array.from(element.style)) {
			const value = element.style.getPropertyValue(property).trim();
			const allowedValues = emailStyles[property] ?? [];

			if (!allowedValues.some((pattern) => pattern.test(value))) {
				element.style.removeProperty(property);
			}
		}
	}
}
