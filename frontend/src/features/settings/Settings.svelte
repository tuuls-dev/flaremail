<script lang="ts">
	import UtilityLayout from "../../app/layouts/UtilityLayout.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { authState, refreshSession } from "../auth/state.svelte";
	import { mutate, describeError } from "../../sdk/client";
	import { toast } from "svelte-sonner";
	import { setTheme } from "./theme";
	import { navigate } from "../../app/router";
	const initialDisplayName = authState.session?.user.name ?? "";
	let displayName = $state(initialDisplayName);
	let currentPassword = $state("");
	let newPassword = $state("");
	let passwordError = $state("");
	let saving = $state(false);

	async function saveProfile(event: SubmitEvent) {
		event.preventDefault();

		try {
			await mutate("auth.profile", { name: displayName });
			await refreshSession();
			toast.success("Profile updated");
		} catch (error) {
			toast.error(describeError(error));
		}
	}

	async function updatePassword(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		passwordError = "";

		try {
			await mutate("auth.changePassword", { currentPassword, password: newPassword });
			await refreshSession();
			currentPassword = "";
			newPassword = "";
			toast.success("Password updated. Other sessions have been signed out.");
			await navigate("/");
		} catch (error) {
			passwordError = describeError(error);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Account settings · Flaremail</title></svelte:head>
<UtilityLayout title="Account settings"
	><div class="settings">
		<h1>Account settings</h1>
		{#if authState.session?.user.mustChangePassword}<div class="notice">
				<Icon name="key" /><span>Replace your temporary password to access your mailbox.</span>
			</div>{/if}
		<section>
			<div class="section-title">
				<Icon name="users" />
				<h2>Your profile</h2>
			</div>
			<form class="form-stack" onsubmit={saveProfile}>
				<label class="field"
					>Display name<input
						bind:value={displayName}
						required
						maxlength="100"
						disabled={authState.session?.user.mustChangePassword}
					/></label
				><label class="field"
					>Sign-in email<input value={authState.session?.user.email} disabled /><small
						>Your administrator manages your sign-in identity.</small
					></label
				>
				<div>
					<button class="button" disabled={authState.session?.user.mustChangePassword}
						>Save changes</button
					>
				</div>
			</form>
		</section>
		<section>
			<div class="section-title">
				<Icon name="key" />
				<h2>Password & security</h2>
			</div>
			<form class="form-stack" onsubmit={updatePassword}>
				<label class="field"
					>Current password<input
						type="password"
						bind:value={currentPassword}
						required
						autocomplete="current-password"
					/></label
				><label class="field"
					>New password<input
						type="password"
						bind:value={newPassword}
						required
						minlength="12"
						maxlength="128"
						autocomplete="new-password"
					/><small>At least 12 characters. Other signed-in sessions will be revoked.</small></label
				>{#if passwordError}<div class="form-error" role="alert">{passwordError}</div>{/if}
				<div>
					<button class="button primary" disabled={saving}
						>{saving ? "Updating…" : "Update password"}</button
					>
				</div>
			</form>
		</section>
		<section>
			<div class="section-title">
				<Icon name="sun" />
				<h2>Appearance</h2>
			</div>
			<div class="themes">
				<button class="theme-option" onclick={() => setTheme("light")}
					><span class="theme-preview light"><i></i><b></b></span><span
						><Icon name="sun" size={15} />Light</span
					></button
				><button class="theme-option" onclick={() => setTheme("dark")}
					><span class="theme-preview dark"><i></i><b></b></span><span
						><Icon name="moon" size={15} />Dark</span
					></button
				>
			</div>
		</section>
	</div></UtilityLayout
>

<style>
	.settings {
		max-width: 600px;
	}
	.settings > h1 {
		margin: 12px 0;
	}
	.notice {
		display: flex;
		gap: 12px;
		padding: 16px;
		background: var(--color-primary-light);
		color: var(--color-primary);
		border-radius: 12px;
		margin-top: 24px;
		font-size: 12px;
	}
	section {
		padding: 30px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.section-title {
		display: flex;
		gap: 10px;
		align-items: center;
		margin-bottom: 24px;
		color: var(--color-muted);
	}
	.section-title h2 {
		font-size: 15px;
		color: var(--color-text);
		margin: 0;
	}
	.themes {
		display: flex;
		gap: 16px;
	}
	.theme-option {
		padding: 0;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		border-radius: 12px;
		overflow: hidden;
		width: 160px;
		color: var(--color-text);
	}
	.theme-option > span:last-child {
		padding: 10px;
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 12px;
	}
	.theme-preview {
		height: 85px;
		display: flex;
		gap: 12px;
		padding: 12px;
		background: #f1f2f6;
	}
	.theme-preview i {
		width: 26px;
		border-radius: 4px;
		background: #e0e2ef;
	}
	.theme-preview b {
		flex: 1;
		border-radius: 4px;
		background: #fff;
	}
	.theme-preview.dark {
		background: #141720;
	}
	.dark i {
		background: #303548;
	}
	.dark b {
		background: #242938;
	}
</style>
