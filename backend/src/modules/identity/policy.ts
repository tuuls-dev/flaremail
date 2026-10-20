import { AppError } from "@flaremail/contracts";
import type { User } from "@flaremail/contracts";

export function requireUser(user: User | null): asserts user is User {
	if (!user) {
		throw new AppError("UNAUTHORIZED", "Sign in to continue.");
	}
}

export function requireInstanceAdmin(user: User | null): asserts user is User {
	requireUser(user);

	if (!user.instanceAdmin) {
		throw new AppError("FORBIDDEN", "Instance administrator access is required.");
	}
}
