<script lang="ts">
	import { onMount } from "svelte";
	import { applySavedTheme } from "../features/settings/theme.svelte";
	import { Router } from "sv-router";
	import { Toaster } from "svelte-sonner";
	import { initializeApplication, authState } from "../features/auth/state.svelte";
	import { navigate } from "./router";
	import { describeError } from "../sdk/client";
	import Icon from "../components/ui/Icon.svelte";
	const startup = initializeApplication();

	function expireSession() {
		authState.session = null;
		void navigate("/login");
	}

	onMount(() => {
		applySavedTheme();
		window.addEventListener("flaremail:session-expired", expireSession);
		return () => window.removeEventListener("flaremail:session-expired", expireSession);
	});
</script>

<svelte:boundary>
	{#if await startup}<Router />{/if}
	{#snippet pending()}<div class="startup">
			<img src="/favicon.svg" alt="Flaremail" width="38" height="38" />
			<p>Opening your workspace<span class="loading-dots">…</span></p>
		</div>{/snippet}
	{#snippet failed(error, reset)}<div class="startup">
			<Icon name="cloudOff" size={32} />
			<h1>We couldn’t connect</h1>
			<p>{describeError(error)}</p>
			<p class="muted">Try again. If the problem continues, contact your instance administrator.</p>
			<button
				class="button primary"
				onclick={() => {
					reset();
					window.location.reload();
				}}>Try again</button
			>
		</div>{/snippet}
</svelte:boundary>
<Toaster position="bottom-right" richColors closeButton />

<style>
	.startup {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		text-align: center;
		padding: 32px;
	}
	.startup p {
		margin: 0;
	}
	.loading-dots {
		color: var(--color-primary);
	}
</style>
