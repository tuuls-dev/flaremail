import { toast } from "svelte-sonner";
import { describeError } from "../../sdk/client";

export async function runAdminAction(
	execute: () => Promise<unknown>,
	onComplete: () => void,
	successMessage: string,
) {
	try {
		await execute();
		onComplete();
		toast.success(successMessage);
		return true;
	} catch (error) {
		toast.error(describeError(error));
		return false;
	}
}
