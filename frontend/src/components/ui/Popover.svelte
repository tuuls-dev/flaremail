<script lang="ts">
	import { Popover } from "bits-ui";
	import type { Snippet } from "svelte";
	let {
		trigger,
		children,
		label,
		open = $bindable(false),
		align = "start",
		triggerClass = "icon-button",
	}: {
		trigger: Snippet;
		children: Snippet;
		label: string;
		open?: boolean;
		align?: "start" | "center" | "end";
		triggerClass?: string;
	} = $props();
</script>

<Popover.Root bind:open>
	<Popover.Trigger class={triggerClass} aria-label={label}>{@render trigger()}</Popover.Trigger>
	<Popover.Portal
		><Popover.Content class="fm-popover" {align} sideOffset={8}
			>{@render children()}</Popover.Content
		></Popover.Portal
	>
</Popover.Root>

<style>
	:global(.fm-popover) {
		z-index: 60;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 6px;
		box-shadow: var(--shadow-popover);
		min-width: 200px;
		max-width: min(360px, calc(100vw - 24px));
		outline: none;
	}
</style>
