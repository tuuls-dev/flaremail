import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { MAX_MESSAGE_SIZE } from "@flaremail/contracts";
import { connectDatabase } from "./platform/database/client";
import type { Database } from "./platform/database/client";
import { createSender } from "./platform/email/sender";
import type { Sender } from "./platform/email/sender";
import type { AppEnvironment, RequestContext } from "./transport/rpc/context";
import { dispatchRpc } from "./transport/rpc/dispatch";
import { receiveInboundEmail } from "./transport/inbound/handler";
import { logEvent } from "./platform/observability/log";

export function createApp(overrides: { database?: Database; sender?: Sender } = {}) {
	const app = new Hono<{
		Bindings: AppEnvironment;
		Variables: { requestContext: RequestContext };
	}>();
	app.use(
		"/api/*",
		bodyLimit({
			maxSize: MAX_MESSAGE_SIZE + 65536,
			onError: (context) => context.json({ error: "Request exceeds the application limit." }, 413),
		}),
	);
	app.use("/api/*", async (context, next) => {
		context.header("Cache-Control", "no-store");
		context.header("X-Content-Type-Options", "nosniff");
		const client = overrides.database ? null : connectDatabase(context.env);
		const database = overrides.database ?? client!;
		const secure = new URL(context.req.url).protocol === "https:";
		const requestId = crypto.randomUUID();
		const startedAt = Date.now();
		context.header("X-Request-Id", requestId);
		const requestContext: RequestContext = {
			requestId,
			database,
			sender: overrides.sender ?? createSender(context.env),
			user: null,
			sessionToken: getCookie(context, "flaremail_session"),
			clientIp: context.req.header("CF-Connecting-IP") ?? "local",
			setSessionToken(token) {
				requestContext.sessionToken = token;
				setCookie(context, "flaremail_session", token, {
					httpOnly: true,
					secure,
					sameSite: "Strict",
					path: "/",
					maxAge: 7 * 86400,
				});
			},
			clearSessionToken() {
				requestContext.sessionToken = undefined;
				deleteCookie(context, "flaremail_session", {
					path: "/",
					secure,
					httpOnly: true,
					sameSite: "Strict",
				});
			},
		};
		context.set("requestContext", requestContext);

		try {
			await next();
			logEvent("request.complete", {
				requestId,
				path: context.req.path,
				status: context.res.status,
				durationMs: Date.now() - startedAt,
			});
		} finally {
			client?.close();
		}
	});
	app.post("/api/webhooks/inbound", (context) =>
		receiveInboundEmail(context.req.raw, context.get("requestContext").database),
	);
	app.post("/api/:endpoint", async (context) => {
		const endpoint = context.req.param("endpoint");

		if (endpoint !== "queries" && endpoint !== "mutations") {
			return context.json({ error: "Not found" }, 404);
		}

		const origin = context.req.header("Origin");
		const requestOrigin = new URL(context.req.url).origin;

		if (origin && origin !== requestOrigin && origin !== context.env.APP_ORIGIN) {
			return context.json({ error: "Origin not allowed" }, 403);
		}

		if (context.req.header("Sec-Fetch-Site") === "cross-site") {
			return context.json({ error: "Cross-site requests are not allowed" }, 403);
		}

		const contentType = context.req.header("Content-Type")?.split(";")[0]?.trim();

		if (contentType !== "application/cbor") {
			return context.json({ error: "Content-Type must be application/cbor" }, 415);
		}

		const response = await dispatchRpc(
			await context.req.arrayBuffer(),
			endpoint,
			context.get("requestContext"),
		);
		return context.newResponse(response.body, response);
	});
	app.all("/api/*", (context) => context.json({ error: "Not found" }, 404));
	app.onError((error, context) => {
		logEvent("request.error", { type: error.name });
		return context.json({ error: "Unable to complete this request." }, 500);
	});
	return app;
}
