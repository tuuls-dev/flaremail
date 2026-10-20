import { connectScriptDatabase } from "./database";
const database = connectScriptDatabase();

try {
	const now = Date.now();
	const abandonedBefore = now - 86400000;
	await database.batch(
		[
			{ sql: "DELETE FROM sessions WHERE expires_at<?", args: [now] },
			{ sql: "DELETE FROM login_attempts WHERE expires_at<?", args: [now] },
			{
				sql: "UPDATE send_attempts SET status='unknown',error='Process interrupted; check delivery logs before resending.' WHERE status='pending' AND updated_at<?",
				args: [now - 120000],
			},
			{
				sql: `DELETE FROM blobs WHERE created_at<? AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.raw_blob_id=blobs.id) AND NOT EXISTS (SELECT 1 FROM message_attachments a WHERE a.blob_id=blobs.id) AND NOT EXISTS (SELECT 1 FROM drafts d, json_each(d.attachment_ids) j WHERE d.id=blobs.draft_id AND j.value=blobs.id) AND NOT EXISTS (SELECT 1 FROM send_attempts s WHERE s.draft_id=blobs.draft_id AND s.status IN ('pending','unknown'))`,
				args: [abandonedBefore],
			},
		],
		"write",
	);
	console.log(
		"Expired sessions, login counters, and abandoned blobs cleaned up. Interrupted sends marked unknown.",
	);
} finally {
	database.close();
}
