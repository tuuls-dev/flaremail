import type { Executor } from "../../platform/database/client";

export function recordAuditEvent(
	database: Executor,
	actorId: string,
	orgId: string | null,
	action: string,
	target: string,
) {
	return database.execute({
		sql: "INSERT INTO audit_events (id,org_id,actor_id,action,target,created_at) VALUES (?,?,?,?,?,?)",
		args: [crypto.randomUUID(), orgId, actorId, action, target, Date.now()],
	});
}
