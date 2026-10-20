<script lang="ts">
	import { Dialog } from "bits-ui";
	import type { Snippet } from "svelte";
	import Icon from "./Icon.svelte";
	let {
		open = $bindable(false),
		title,
		description = "",
		children,
		wide = false,
		onclose,
		preventClose = false,
		onrequestclose,
	}: {
		open?: boolean;
		title: string;
		description?: string;
		children: Snippet;
		wide?: boolean;
		onclose?: () => void;
		preventClose?: boolean;
		onrequestclose?: () => void;
	} = $props();

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			onclose?.();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="fm-overlay" />
		<Dialog.Content
			class={wide ? "fm-dialog fm-dialog-wide" : "fm-dialog"}
			escapeKeydownBehavior={preventClose ? "ignore" : "close"}
			interactOutsideBehavior={preventClose ? "ignore" : "close"}
			onEscapeKeydown={(event) => {
				if (onrequestclose) {
					event.preventDefault();
					if (!preventClose) {
						onrequestclose();
					}
				}
			}}
			onInteractOutside={(event) => {
				if (onrequestclose) {
					event.preventDefault();
				}
			}}
		>
			<div class="dialog-heading">
				<div>
					<Dialog.Title class="dialog-title">{title}</Dialog.Title
					>{#if description}<Dialog.Description class="dialog-description"
							>{description}</Dialog.Description
						>{:else}<Dialog.Description class="sr-only">{title}</Dialog.Description>{/if}
				</div>
				<button
					class="icon-button"
					aria-label="Close dialog"
					disabled={preventClose}
					onclick={() => {
						if (onrequestclose) {
							onrequestclose();
						} else {
							open = false;
							onclose?.();
						}
					}}><Icon name="close" /></button
				>
			</div>
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.fm-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(17, 24, 39, 0.35);
		backdrop-filter: blur(3px);
		z-index: 50;
		animation: appear 0.12s ease;
	}
	:global(.fm-dialog) {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(480px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		overflow: auto;
		padding: 28px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-dialog);
		z-index: 51;
		outline: none;
	}
	:global(.fm-dialog-wide) {
		width: min(720px, calc(100vw - 32px));
	}
	.dialog-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}
	:global(.dialog-title) {
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.5px;
		margin: 0;
	}
	:global(.dialog-description) {
		font-size: 13px;
		line-height: 1.6;
		color: var(--color-muted);
		margin: 8px 0 0;
	}
	@keyframes appear {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (max-width: 600px) {
		:global(.fm-dialog-wide) {
			inset: 0;
			transform: none;
			width: 100%;
			max-height: 100dvh;
			height: 100dvh;
			border-radius: 0;
			padding: 20px;
		}
	}
</style>
