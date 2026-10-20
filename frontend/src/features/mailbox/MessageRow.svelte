<script lang="ts">
	import type { MessageSummary } from "@flaremail/contracts";
	import Icon from "../../components/ui/Icon.svelte";
	let {
		message,
		href,
		selected,
		active,
		ontoggle,
		onstar,
		onfocusrow,
	}: {
		message: MessageSummary;
		href: string;
		selected: boolean;
		active: boolean;
		ontoggle: () => void;
		onstar: () => void;
		onfocusrow: () => void;
	} = $props();

	function formatDate(timestamp: number) {
		const date = new Date(timestamp);
		const today = new Date();

		if (date.toDateString() === today.toDateString()) {
			return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
		}

		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	}

	function readInitials(value: string) {
		return value
			.replace(/@.*$/, "")
			.split(/[\s._-]+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join("")
			.toUpperCase();
	}

	const senderLabel = $derived.by(() => {
		if (message.direction === "outbound") {
			return message.recipients.join(", ") || "Undisclosed recipients";
		}

		return message.senderName || message.sender;
	});
	const avatarColor = $derived.by(
		() => ["violet", "blue", "green", "orange", "pink"][senderLabel.charCodeAt(0) % 5],
	);
</script>

<div
	class="message-row"
	class:unread={message.unread}
	class:selected
	class:active
	data-thread-id={message.threadId}
>
	<div class="select-area">
		<input
			type="checkbox"
			checked={selected}
			onchange={ontoggle}
			aria-label={`Select conversation ${message.subject || "No subject"}`}
		/>
	</div>
	<a onfocus={onfocusrow} {href} class="message-link" aria-current={active ? "page" : undefined}>
		<span class={`sender-avatar ${avatarColor}`}>{readInitials(senderLabel)}</span>
		<div class="message-content">
			<div class="row-top">
				<span class="sender"
					>{senderLabel}{#if message.count > 1}<span class="thread-count">{message.count}</span
						>{/if}</span
				><time datetime={new Date(message.receivedAt).toISOString()}
					>{formatDate(message.receivedAt)}</time
				>
			</div>
			<div class="subject">{message.subject || "(no subject)"}</div>
			<div class="preview">{message.snippet || "No message preview"}</div>
			{#if message.labels.length}<div class="labels">
					{#each message.labels as label}<span style:--label-color={label.color}>{label.name}</span
						>{/each}
				</div>{/if}
		</div>
	</a>
	<div class="row-actions">
		<button
			class="star-button"
			class:starred={message.starred}
			aria-label={message.starred ? "Unstar conversation" : "Star conversation"}
			aria-pressed={message.starred}
			onclick={onstar}><Icon name="star" size={15} /></button
		>{#if message.attachmentCount}<span class="attachment-indicator" aria-label="Has attachments"
				><Icon name="attachment" size={13} /></span
			>{/if}{#if message.unread}<span class="unread-dot" aria-label="Unread"></span>{/if}
	</div>
</div>

<style>
	.message-row {
		display: flex;
		position: relative;
		align-items: center;
		min-height: 100px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		transition: background 0.1s;
	}
	.message-row:hover {
		background: var(--color-surface-subtle);
	}
	.message-row.selected,
	.message-row.active {
		background: var(--color-selection);
	}
	.message-row.active::before {
		content: "";
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--color-primary);
	}
	.select-area {
		padding-left: 16px;
		display: flex;
	}
	.select-area input {
		width: 13px;
		height: 13px;
		accent-color: var(--color-primary);
		cursor: pointer;
		opacity: 0;
	}
	.message-row:hover input,
	.message-row:focus-within input,
	.message-row.selected input {
		opacity: 1;
	}
	.message-link {
		flex: 1;
		display: flex;
		gap: 12px;
		min-width: 0;
		padding: 16px 17px 15px 12px;
		align-self: stretch;
	}
	.sender-avatar {
		width: 34px;
		height: 34px;
		border-radius: 11px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 550;
		background: #eeeafa;
		color: #8476bb;
	}
	.blue {
		background: #e8eff9;
		color: #6c8cb8;
	}
	.green {
		background: #e4f1ec;
		color: #5a9a84;
	}
	.orange {
		background: #fbede2;
		color: #ba8a59;
	}
	.pink {
		background: #f6e7ee;
		color: #b77799;
	}
	.message-content {
		flex: 1;
		min-width: 0;
		padding-right: 16px;
	}
	.row-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-bottom: 5px;
	}
	.sender {
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-muted);
	}
	.unread .sender {
		font-weight: 650;
		color: var(--color-text);
	}
	.thread-count {
		color: var(--color-faint);
		font-weight: 400;
		font-size: 10px;
		margin-left: 5px;
	}
	time {
		font-size: 9px;
		color: var(--color-faint);
		white-space: nowrap;
	}
	.unread time {
		color: var(--color-primary);
	}
	.subject {
		font-size: 12px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 4px;
	}
	.unread .subject {
		font-weight: 600;
	}
	.preview {
		font-size: 11px;
		color: var(--color-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.6;
	}
	.row-actions {
		position: absolute;
		right: 16px;
		top: 49px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 7px;
	}
	.star-button {
		border: 0;
		background: transparent;
		color: var(--color-faint);
		padding: 0;
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
	}
	.starred {
		color: #d8a84f;
	}
	.starred :global(svg) {
		fill: color-mix(in srgb, #d8a84f 15%, transparent);
	}
	.attachment-indicator {
		color: var(--color-faint);
		display: flex;
	}
	.unread-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-primary);
	}
	.labels {
		display: flex;
		gap: 5px;
		margin-top: 7px;
	}
	.labels span {
		font-size: 9px;
		padding: 2px 5px;
		border-radius: 4px;
		color: var(--label-color);
		background: color-mix(in srgb, var(--label-color) 10%, transparent);
	}
	@media (max-width: 600px) {
		.select-area input {
			opacity: 1;
		}
		.select-area {
			padding-left: 10px;
		}
		.message-link {
			padding-left: 10px;
		}
		.sender-avatar {
			display: none;
		}
	}
</style>
