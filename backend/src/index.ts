import { createApp } from "./app";
import { connectDatabase } from "./platform/database/client";
import { receiveInboundEmail } from "./transport/inbound/handler";
const app = createApp();
export default {
	fetch: app.fetch,
	async email(message, environment) {
		const database = connectDatabase(environment);

		try {
			await receiveInboundEmail(message, database);
		} finally {
			database.close();
		}
	},
} satisfies ExportedHandler<BackendEnv>;
