import { z } from "zod";
export const id = z.string().min(1).max(100);
export const email = z
	.email()
	.max(254)
	.transform((value) => value.toLowerCase());
export const password = z.string().min(12).max(128);
export const name = z.string().trim().min(1).max(100);
export const userSchema = z.object({
	id,
	email: z.string(),
	name: z.string(),
	instanceAdmin: z.boolean(),
	mustChangePassword: z.boolean(),
	disabled: z.boolean(),
});
export type User = z.infer<typeof userSchema>;
export const sessionSchema = z.object({ user: userSchema, instanceName: z.string() });
export type Session = z.infer<typeof sessionSchema>;
