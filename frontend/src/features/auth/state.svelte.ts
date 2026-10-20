import type { Session, Result } from "@flaremail/contracts";
import { query } from "../../sdk/client";
export const authState = $state<{ session: Session | null; instance: Result<"instance.status"> }>({
	session: null,
	instance: { initialized: false, name: "Flaremail" },
});

export async function initializeApplication() {
	const [instance, session] = await Promise.all([
		query("instance.status", {}),
		query("auth.session", {}),
	]);
	authState.instance = instance;
	authState.session = session;
	return true;
}

export async function refreshSession() {
	authState.session = await query("auth.session", {});
}
