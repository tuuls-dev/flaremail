export function applySavedTheme() {
	const theme = localStorage.getItem("flaremail-theme") ?? "light";
	document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: "light" | "dark") {
	localStorage.setItem("flaremail-theme", theme);
	applySavedTheme();
}
