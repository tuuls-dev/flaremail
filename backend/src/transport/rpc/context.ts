import type { User } from "@flaremail/contracts";
import type { Database } from "../../platform/database/client";
import type { Sender } from "../../platform/email/sender";
export type AppEnvironment = BackendEnv;
export interface RequestContext {
	database: Database;
	requestId: string;
	sender: Sender;
	user: User | null;
	sessionToken: string | undefined;
	clientIp: string;
	setSessionToken: (token: string) => void;
	clearSessionToken: () => void;
}
