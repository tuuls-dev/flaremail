// Scripts remain disabled in the iframe. Same-origin access lets only the host measure it.
export function resizeEmailFrame(frame: HTMLIFrameElement) {
	let observer: ResizeObserver | undefined;
	let body: HTMLElement | undefined;
	let animationFrame = 0;

	function measureEmailBody() {
		animationFrame = 0;

		if (body) {
			const height = Math.ceil(body.getBoundingClientRect().height);
			frame.style.height = `${height + 4}px`;
		}
	}

	function scheduleEmailMeasurement() {
		cancelAnimationFrame(animationFrame);
		animationFrame = requestAnimationFrame(measureEmailBody);
	}

	function observeEmailBody() {
		observer?.disconnect();
		body = frame.contentDocument?.body;

		if (body) {
			observer = new ResizeObserver(scheduleEmailMeasurement);
			observer.observe(body);
			scheduleEmailMeasurement();
		}
	}

	frame.addEventListener("load", observeEmailBody);
	return {
		destroy() {
			frame.removeEventListener("load", observeEmailBody);
			observer?.disconnect();
			cancelAnimationFrame(animationFrame);
		},
	};
}
