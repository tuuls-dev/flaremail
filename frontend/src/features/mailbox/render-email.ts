import { emailStyles } from "@flaremail/contracts";
import createDOMPurify from "dompurify";
import { linkifyHtmlDocument } from "./linkify-email";

function sanitizeRenderedHtml(html: string) {
	const sanitizer =
		typeof createDOMPurify.sanitize === "function" ? createDOMPurify : createDOMPurify(window);
	return sanitizer.sanitize(html, {
		FORBID_TAGS: ["style", "form", "input", "button", "video", "audio", "svg", "math"],
		FORBID_ATTR: ["srcset", "background", "formaction"],
		ADD_ATTR: ["cellpadding", "cellspacing", "bgcolor", "valign"],
	});
}

export type EmailChrome = {
	colorScheme: "light" | "dark";
	background: string;
	text: string;
	link: string;
	border: string;
	faint: string;
};

const fallbackChrome: Record<EmailChrome["colorScheme"], EmailChrome> = {
	light: {
		colorScheme: "light",
		background: "#ffffff",
		text: "#242735",
		link: "#5555db",
		border: "#e9ebf0",
		faint: "#687183",
	},
	dark: {
		colorScheme: "dark",
		background: "#1b1e28",
		text: "#e8eaf3",
		link: "#a6a2ff",
		border: "#2b3040",
		faint: "#919bb1",
	},
};

function readSafeCssColor(value: string, fallback: string) {
	const color = value.trim();

	if (/^#(?:[\da-f]{3,8})$/i.test(color) || /^(?:rgb|hsl)a?\([^)]+\)$/i.test(color)) {
		return color;
	}

	return fallback;
}

function readTokenColor(root: CSSStyleDeclaration, token: string, fallback: string) {
	return readSafeCssColor(root.getPropertyValue(token), fallback);
}

export function readEmailChrome(colorScheme: EmailChrome["colorScheme"]): EmailChrome {
	const fallback = fallbackChrome[colorScheme];

	if (typeof document === "undefined") {
		return fallback;
	}

	const root = getComputedStyle(document.documentElement);
	return {
		colorScheme,
		background: readTokenColor(root, "--color-surface", fallback.background),
		text: readTokenColor(root, "--color-text", fallback.text),
		link: readTokenColor(root, "--color-primary", fallback.link),
		border: readTokenColor(root, "--color-border", fallback.border),
		faint: readTokenColor(root, "--color-faint", fallback.faint),
	};
}

function buildEmailChromeStyles(chrome: EmailChrome) {
	const fallback = fallbackChrome[chrome.colorScheme];
	const background = readSafeCssColor(chrome.background, fallback.background);
	const text = readSafeCssColor(chrome.text, fallback.text);
	const link = readSafeCssColor(chrome.link, fallback.link);
	const border = readSafeCssColor(chrome.border, fallback.border);
	const faint = readSafeCssColor(chrome.faint, fallback.faint);
	const colorScheme = chrome.colorScheme === "dark" ? "dark" : "light";
	return `html { overflow: hidden; color-scheme: ${colorScheme}; }
body { margin: 0; padding: 2px; display: flow-root; color: ${text}; background: ${background};
font: 13px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow-wrap: anywhere; }
img, table { max-width: 100%; } img { height: auto; }
pre { white-space: pre-wrap; } a { color: ${link}; }
blockquote { margin-left: 12px; border-left: 2px solid ${border}; padding-left: 16px; }
details { margin-top: 12px; } summary { cursor: pointer; color: ${faint}; }`;
}

export function renderEmailDocument(
	html: string,
	loadRemoteImages: boolean,
	inlineImages: Record<string, string>,
	chrome: EmailChrome,
) {
	const safeHtml = sanitizeRenderedHtml(html);
	const document = new DOMParser().parseFromString(safeHtml, "text/html");

	filterEmailStyles(document);

	collapseQuotedHistory(document);

	linkifyHtmlDocument(document);

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
${buildEmailChromeStyles(chrome)}
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
