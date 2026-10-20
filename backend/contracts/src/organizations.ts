import { z } from "zod";
export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	role: z.enum(["admin", "member"]),
});
export const memberSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	role: z.enum(["admin", "member"]),
	disabled: z.boolean(),
	instanceAdmin: z.boolean(),
});
export const auditSchema = z.object({
	id: z.string(),
	actor: z.string(),
	action: z.string(),
	target: z.string(),
	createdAt: z.number(),
});
export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
