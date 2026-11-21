<script lang="ts">
	import AuthLayout from "../../app/layouts/AuthLayout.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { authState } from "./state.svelte";
	import { mutate, describeError } from "../../sdk/client";
	import { navigate } from "../../app/router";
	let instanceName = $state("Flaremail");
	let adminName = $state("");
	let adminEmail = $state("");
	let adminPassword = $state("");
	let errorMessage = $state("");
	let submitting = $state(false);

	async function submitSetup(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		errorMessage = "";

		try {
			const session = await mutate("instance.setup", {
				instanceName,
				name: adminName,
				email: adminEmail,
				password: adminPassword,
			});
			authState.session = session;
			authState.instance = { initialized: true, name: session.instanceName };
			await navigate("/admin");
		} catch (error) {
			errorMessage = describeError(error);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Set up your instance · Flaremail</title></svelte:head>
<AuthLayout
	><div class="setup">
		{#if authState.instance.initialized}<span class="setup-icon"
				><Icon name="checkCircle" size={25} /></span
			>
			<h1>Instance already initialized</h1>
			<a class="button primary" href={authState.session ? "/admin" : "/login"}
				>Continue <Icon name="arrowUpRight" size={16} /></a
			>
		{:else}<span class="setup-icon"><Icon name="shield" size={25} /></span>
			<h1>Set up instance</h1>
			<p class="lead">Name your instance and create the first administrator account.</p>
			<form class="form-stack" onsubmit={submitSetup}>
				<label class="field"
					>Instance name<input
						bind:value={instanceName}
						required
						maxlength="100"
						autocomplete="organization"
					/><small>The name your team sees when they sign in.</small></label
				>
				<div class="form-row">
					<label class="field"
						>Your name<input
							bind:value={adminName}
							required
							maxlength="100"
							autocomplete="name"
							placeholder="Alex Morgan"
						/></label
					><label class="field"
						>Sign-in email<input
							type="email"
							bind:value={adminEmail}
							required
							autocomplete="username"
							placeholder="alex@example.com"
						/></label
					>
				</div>
				<label class="field"
					>Create a password<input
						type="password"
						bind:value={adminPassword}
						required
						minlength="12"
						maxlength="128"
						autocomplete="new-password"
						placeholder="At least 12 characters"
					/><small>Use a unique password with at least 12 characters.</small></label
				>
				{#if errorMessage}<div class="form-error" role="alert">{errorMessage}</div>{/if}
				<button class="button primary submit" disabled={submitting}
					>{submitting ? "Setting up…" : "Create instance"}<Icon
						name="arrowUpRight"
						size={17}
					/></button
				>
			</form>
			<div class="next">
				<Icon name="building" size={16} /><span
					>Next, you’ll add an organization, domain, and mailboxes.</span
				>
			</div>
		{/if}
	</div></AuthLayout
>

<style>
	.setup {
		width: 100%;
		max-width: 440px;
	}
	.setup-icon {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		background: var(--color-primary-light);
		color: var(--color-primary);
		border-radius: 16px;
		margin-bottom: 28px;
	}
	.setup h1 {
		font-size: 29px;
		margin-bottom: 12px;
	}
	.lead {
		color: var(--color-muted);
		font-size: 13px;
		line-height: 1.8;
		margin-bottom: 30px;
	}
	.submit {
		width: 100%;
		margin-top: 6px;
		min-height: 44px;
	}
	.next {
		display: flex;
		gap: 9px;
		color: var(--color-muted);
		font-size: 11px;
		margin-top: 24px;
		align-items: center;
	}
</style>
