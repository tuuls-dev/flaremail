// Scripts remain disabled in the iframe. Same-origin access lets only the host measure it.
export function resizeEmailFrame(frame: HTMLIFrameElement) {
	let observer: ResizeObserver | undefined;
	let body: HTMLElement | undefined;

	function measureEmailBody() {
		if (body) {
			const height = Math.ceil(body.getBoundingClientRect().height);
			frame.style.height = `${height + 4}px`;
		}
	}

	function observeEmailBody() {
		observer?.disconnect();
		body = frame.contentDocument?.body;

		if (body) {
			observer = new ResizeObserver(measureEmailBody);
			observer.observe(body);
			measureEmailBody();
		}
	}

	frame.addEventListener("load", observeEmailBody);
	return {
		destroy() {
			frame.removeEventListener("load", observeEmailBody);
			observer?.disconnect();
		},
	};
}
