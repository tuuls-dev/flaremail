import { z } from "zod";
export const mailboxSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	address: z.string(),
	name: z.string(),
	disabled: z.boolean(),
});
export const grantSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
export type Mailbox = z.infer<typeof mailboxSchema>;
