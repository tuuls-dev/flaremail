import { z } from "zod";
export const domainSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	name: z.string(),
	ready: z.boolean(),
});
export type Domain = z.infer<typeof domainSchema>;
