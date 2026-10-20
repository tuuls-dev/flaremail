import sanitize from "sanitize-html";

export function sanitizeEmail(html: string) {
	return sanitize(html, {
		allowedTags: [
			"p",
			"br",
			"div",
			"span",
			"b",
			"strong",
			"i",
			"em",
			"u",
			"s",
			"blockquote",
			"pre",
			"code",
			"ul",
			"ol",
			"li",
			"a",
			"h1",
			"h2",
			"h3",
			"h4",
			"table",
			"tbody",
			"thead",
			"tr",
			"td",
			"th",
			"hr",
			"img",
		],
		allowedAttributes: {
			a: ["href", "title"],
			img: ["src", "alt", "width", "height"],
			td: ["colspan", "rowspan"],
			th: ["colspan", "rowspan"],
		},
		allowedSchemes: ["http", "https", "mailto", "cid"],
		allowProtocolRelative: false,
		transformTags: {
			a: sanitize.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
		},
	});
}
