export type ThemeName = "light" | "dark";

export const theme = $state({
	name: "light" as ThemeName,
});

function readStoredTheme(): ThemeName {
	return localStorage.getItem("flaremail-theme") === "dark" ? "dark" : "light";
}

export function applySavedTheme() {
	const name = readStoredTheme();
	document.documentElement.dataset.theme = name;
	theme.name = name;
}

export function setTheme(name: ThemeName) {
	localStorage.setItem("flaremail-theme", name);
	applySavedTheme();
}
