import { connectScriptDatabase } from "./database";
import { completeInstanceSetup } from "../src/modules/identity/service";
import { mutations } from "@flaremail/contracts";
const database = connectScriptDatabase();

try {
	const input = mutations["instance.setup"].params.parse({
		instanceName: process.env.INSTANCE_NAME ?? "Flaremail",
		name: process.env.ADMIN_NAME,
		email: process.env.ADMIN_EMAIL,
		password: process.env.ADMIN_PASSWORD,
	});
	await completeInstanceSetup(database, input, () => {});
	console.log("Instance initialized. Sign in using the configured administrator credentials.");
} finally {
	database.close();
}
