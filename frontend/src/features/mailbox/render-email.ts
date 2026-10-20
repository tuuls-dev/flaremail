import emailFoundationStyles from "../../styles/bootstrap.css?inline";
import DOMPurify from "dompurify";

export function renderEmailDocument(
	html: string,
	loadRemoteImages: boolean,
	inlineImages: Record<string, string>,
) {
	const safeHtml = DOMPurify.sanitize(html, {
		FORBID_TAGS: ["style", "form", "input", "button", "video", "audio", "svg", "math"],
		FORBID_ATTR: ["style", "srcset", "background", "formaction"],
	});
	const document = new DOMParser().parseFromString(safeHtml, "text/html");

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
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imagePolicy}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${emailFoundationStyles}</style></head><body class="email-document">${document.body.innerHTML}</body></html>`;
}
