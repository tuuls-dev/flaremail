// Both sanitizers use this small, resource-free subset of inline email CSS.
const color = /^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i;
const lengths =
	/^(?:auto|0|\d+(?:\.\d+)?(?:px|pt|em|rem|%))(?:\s+(?:0|\d+(?:\.\d+)?(?:px|pt|em|rem|%))){0,3}$/i;
export const emailStyles: Record<string, RegExp[]> = {
	color: [color],
	"background-color": [color],
	"font-family": [/^[\w\s,'"-]+$/],
	"font-size": [lengths],
	"font-weight": [/^(?:normal|bold|bolder|lighter|[1-9]00)$/],
	"font-style": [/^(?:normal|italic|oblique)$/],
	"text-decoration": [
		/^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/,
	],
	"text-align": [/^(?:left|right|center|justify|start|end)$/],
	"vertical-align": [/^(?:top|middle|bottom|baseline|text-top|text-bottom|sub|super)$/],
	"line-height": [/^(?:normal|\d+(?:\.\d+)?(?:px|pt|em|rem|%)?)$/],
	"white-space": [/^(?:normal|pre|pre-wrap|pre-line|nowrap)$/],
	width: [lengths],
	height: [lengths],
	"max-width": [lengths],
	"border-collapse": [/^(?:collapse|separate)$/],
	"border-spacing": [lengths],
};

for (const side of ["", "-top", "-right", "-bottom", "-left"]) {
	emailStyles[`margin${side}`] = [lengths];
	emailStyles[`padding${side}`] = [lengths];
	emailStyles[`border${side}`] = [/^[\d\w\s#.,%-]+$/];
}
