import { createRouter } from "sv-router";
import { authState } from "../features/auth/state.svelte";
export const {
	navigate,
	route,
	p: buildRoutePath,
} = createRouter({
	"/": () => import("../features/workspace/Home.svelte"),
	"/instance/setup": () => import("../features/auth/Setup.svelte"),
	"/login": () => import("../features/auth/Login.svelte"),
	"/settings": () => import("../features/settings/Settings.svelte"),
	"/admin": () => import("../features/administration/Admin.svelte"),
	"/admin/:orgId": () => import("../features/administration/Admin.svelte"),
	"/orgs/:orgId/mailboxes/:mailboxId/:folder": () => import("../features/mailbox/MailPage.svelte"),
	"/orgs/:orgId/mailboxes/:mailboxId/:folder/:threadId": () =>
		import("../features/mailbox/MailPage.svelte"),
	"*": () => import("../features/workspace/NotFound.svelte"),
	hooks: {
		async beforeLoad({ pathname }) {
			if (pathname === "/instance/setup") {
				return;
			}

			if (!authState.instance.initialized) {
				throw await navigate("/instance/setup");
			}

			if (!authState.session && pathname !== "/login") {
				throw await navigate("/login");
			}

			if (authState.session?.user.mustChangePassword && pathname !== "/settings") {
				throw await navigate("/settings");
			}
		},
	},
});

export function buildMailboxPath(
	orgId: string,
	mailboxId: string,
	folder = "inbox",
	threadId?: string,
) {
	const basePath = `/orgs/${encodeURIComponent(orgId)}/mailboxes/${encodeURIComponent(mailboxId)}/${encodeURIComponent(folder)}`;
	return threadId ? `${basePath}/${encodeURIComponent(threadId)}` : basePath;
}
