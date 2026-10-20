export function logEvent(event: string, data: Record<string, string | number | boolean>) {
	console.log(JSON.stringify(Object.assign({ event }, data)));
}
