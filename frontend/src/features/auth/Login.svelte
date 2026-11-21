<script lang="ts">
	import AuthLayout from "../../app/layouts/AuthLayout.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { authState } from "./state.svelte";
	import { mutate, describeError } from "../../sdk/client";
	import { navigate } from "../../app/router";
	let emailAddress = $state("");
	let password = $state("");
	let errorMessage = $state("");
	let submitting = $state(false);

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		errorMessage = "";

		try {
			authState.session = await mutate("auth.login", { email: emailAddress, password });
			await navigate("/");
		} catch (error) {
			errorMessage = describeError(error);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Sign in · {authState.instance.name}</title></svelte:head>
<AuthLayout
	><div class="login">
		<p class="eyebrow">{authState.instance.name}</p>
		<h1>Sign in</h1>
		<form class="form-stack" onsubmit={signIn}>
			<label class="field"
				>Email address<input
					type="email"
					bind:value={emailAddress}
					required
					autocomplete="username"
					placeholder="you@example.com"
				/></label
			><label class="field"
				>Password<input
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					placeholder="Your password"
				/></label
			>{#if errorMessage}<div class="form-error" role="alert">{errorMessage}</div>{/if}<button
				class="button primary submit"
				disabled={submitting}
				>{submitting ? "Signing in…" : "Sign in"}<Icon name="arrowUpRight" size={16} /></button
			>
		</form>
		<p class="help">
			Need an account or a password reset?<br />Your organization administrator can help.
		</p>
	</div></AuthLayout
>

<style>
	.login {
		width: 100%;
		max-width: 380px;
	}
	.login h1 {
		font-size: 29px;
		margin: 16px 0 32px;
	}
	.submit {
		min-height: 44px;
		margin-top: 8px;
	}
	.help {
		color: var(--color-muted);
		font-size: 12px;
		line-height: 1.8;
		margin: 26px 0 0;
	}
</style>
