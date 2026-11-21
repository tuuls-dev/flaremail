<script lang="ts">
	/* eslint-disable no-await-in-loop -- Load inline attachments sequentially to bound memory. */
	import { untrack } from "svelte";
	import type { Message } from "@flaremail/contracts";
	import Icon from "../../components/ui/Icon.svelte";
	import Popover from "../../components/ui/Popover.svelte";
	import { downloadAttachment, readAttachment, formatFileSize } from "../../sdk/attachments";
	import { describeError } from "../../sdk/client";
	import { renderEmailDocument } from "./render-email";
	import { resizeEmailFrame } from "./resize-email";
	import { toast } from "svelte-sonner";
	import { formatShortcut } from "../../keyboard/shortcuts";
	let {
		messages,
		mailboxId,
		loading,
		errorMessage,
		onreply,
		onarchive,
		ontrash,
		onback,
		onunread,
	}: {
		messages: Message[];
		mailboxId: string;
		loading: boolean;
		errorMessage: string;
		onreply: (message: Message, mode: "reply" | "replyAll" | "forward") => void;
		onarchive: () => void;
		ontrash: () => void;
		onback: () => void;
		onunread: () => void;
	} = $props();
	let loadRemoteImages = $state(false);
	let inlineImages = $state<Record<string, Record<string, string>>>({});
	let imageVersion = 0;
	const subject = $derived.by(() => messages[0]?.subject || "(no subject)");

	async function loadInlineImages(message: Message) {
		const requestVersion = ++imageVersion;
		const currentMailboxId = mailboxId;

		try {
			const attachments = message.attachments.filter(
				(attachment) => attachment.contentId && attachment.contentType.startsWith("image/"),
			);

			for (const attachment of attachments) {
				const file = await readAttachment(currentMailboxId, attachment.id);

				if (requestVersion !== imageVersion) {
					return;
				}

				const objectUrl = URL.createObjectURL(new Blob([file.bytes], { type: file.contentType }));
				const messageImages = Object.assign({}, inlineImages[message.id]);
				const previousUrl = messageImages[attachment.contentId!];

				if (previousUrl) {
					URL.revokeObjectURL(previousUrl);
				}

				messageImages[attachment.contentId!] = objectUrl;
				inlineImages = Object.assign({}, inlineImages, { [message.id]: messageImages });
			}
		} catch (error) {
			if (requestVersion === imageVersion) {
				toast.error(describeError(error));
			}
		}
	}

	async function saveAttachment(blobId: string) {
		try {
			await downloadAttachment(mailboxId, blobId);
		} catch (error) {
			toast.error(describeError(error));
		}
	}

	const imageScope = $derived(
		JSON.stringify([
			mailboxId,
			messages.map((message) => [
				message.id,
				message.attachments.map((attachment) => attachment.id),
			]),
		]),
	);
	$effect(() => {
		void imageScope;
		untrack(() => {
			loadRemoteImages = false;
		});

		return () => {
			imageVersion++;

			for (const messageImages of Object.values(inlineImages)) {
				for (const objectUrl of Object.values(messageImages)) {
					URL.revokeObjectURL(objectUrl);
				}
			}

			inlineImages = {};
		};
	});
</script>

<div class="conversation">
	<div class="conversation-toolbar">
		<button class="icon-button back-button" aria-label="Back to message list" onclick={onback}
			><Icon name="back" /></button
		>
		<div class="toolbar-group">
			<button
				class="icon-button"
				aria-label="Archive conversation"
				disabled={!messages.length}
				title={`Archive (${formatShortcut("archive")})`}
				onclick={onarchive}><Icon name="archive" size={17} /></button
			><button
				class="icon-button"
				aria-label="Move conversation to trash"
				disabled={!messages.length}
				onclick={ontrash}><Icon name="trash" size={17} /></button
			><span class="toolbar-divider"></span><button
				class="icon-button"
				aria-label="Mark conversation unread"
				disabled={!messages.length}
				onclick={onunread}><Icon name="mail" size={17} /></button
			>
		</div>
		<span class="conversation-label">Conversation</span><Popover
			label="Conversation options"
			align="end"
			>{#snippet trigger()}<Icon name="more" />{/snippet}{#snippet children()}<button
					class="menu-item"
					onclick={onunread}><Icon name="mail" size={15} />Mark unread</button
				>{#if messages[0]?.rawBlobId}<button
						class="menu-item"
						onclick={() => saveAttachment(messages[0].rawBlobId!)}
						><Icon name="download" size={15} />Download original</button
					>{/if}{/snippet}</Popover
		>
	</div>
	{#if loading}<div class="reader-state">
			<Icon name="mailOpen" size={30} />
			<p>Opening conversation…</p>
		</div>{:else if errorMessage}<div class="reader-state">
			<Icon name="alert" size={30} />
			<p>{errorMessage}</p>
		</div>{:else if messages.length}<div class="conversation-scroll">
			<div class="subject-heading">
				<h1>{subject}</h1>
				<span class="message-count"
					>{messages.length} {messages.length === 1 ? "message" : "messages"}</span
				>
			</div>
			{#each messages as message (message.id)}<article>
					<div class="message-header">
						<span class="avatar sender-avatar"
							>{(message.senderName || message.sender).slice(0, 2).toUpperCase()}</span
						>
						<div class="sender-info">
							<strong>{message.senderName || message.sender}</strong><span class="sender-address"
								>&lt;{message.sender}&gt;</span
							>
							<div class="recipients">
								to {message.to.join(", ") || "undisclosed recipients"}{#if message.cc.length}
									· cc {message.cc.join(
										", ",
									)}{/if}{#if message.direction === "outbound" && message.bcc.length}
									· bcc {message.bcc.join(", ")}{/if}
							</div>
						</div>
						<time
							>{new Date(message.receivedAt).toLocaleString([], {
								month: "short",
								day: "numeric",
								hour: "numeric",
								minute: "2-digit",
							})}</time
						><button
							class="icon-button inline-reply"
							aria-label="Reply to this message"
							onclick={() => onreply(message, "reply")}><Icon name="reply" size={17} /></button
						>
					</div>
					{#if message.html}<div class="image-notice">
							<Icon name="image" size={13} /><span
								>{loadRemoteImages
									? "Remote images enabled for this view."
									: "Remote images are hidden to protect your privacy."}</span
							><button onclick={() => (loadRemoteImages = !loadRemoteImages)}
								>{loadRemoteImages ? "Hide images" : "Load images"}</button
							>{#if message.attachments.some((attachment) => attachment.contentId)}<button
									onclick={() => loadInlineImages(message)}>Load inline images</button
								>{/if}
						</div>
						<iframe
							title={`Message from ${message.sender}`}
							sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
							use:resizeEmailFrame
							srcdoc={renderEmailDocument(
								message.html,
								loadRemoteImages,
								inlineImages[message.id] ?? {},
							)}
						></iframe>{:else}<div class="plain-text">
							{message.text || "This message has no text content."}
						</div>{/if}
					{#if message.attachments.length}<div class="attachments">
							<span class="attachment-label"
								><Icon name="attachment" size={13} />{message.attachments.length}
								{message.attachments.length === 1 ? "attachment" : "attachments"}</span
							>
							<div class="attachment-list">
								{#each message.attachments as attachment}<button
										class="attachment-card"
										onclick={() => saveAttachment(attachment.id)}
										><span class="file-icon"><Icon name="attachment" size={19} /></span><span
											><b>{attachment.filename}</b><small>{formatFileSize(attachment.size)}</small
											></span
										><Icon name="download" size={15} /></button
									>{/each}
							</div>
						</div>{/if}
				</article>{/each}
			<div class="reply-actions">
				<button class="button" onclick={() => onreply(messages[messages.length - 1], "reply")}
					><Icon name="reply" size={16} />Reply <kbd>{formatShortcut("reply")}</kbd></button
				><button class="button" onclick={() => onreply(messages[messages.length - 1], "replyAll")}
					><Icon name="replyAll" size={16} />Reply all</button
				><button
					class="button subtle"
					onclick={() => onreply(messages[messages.length - 1], "forward")}
					><Icon name="forward" size={16} />Forward</button
				>
			</div>
		</div>
	{:else}<div class="reader-state empty-reader">
			<div class="empty-reader-art">
				<Icon name="mailOpen" size={42} /><span class="small-spark">✦</span>
			</div>
			<p>Choose a conversation to read it here.</p>
			<div class="reader-shortcuts">
				<span
					><kbd>{formatShortcut("nextConversation")}</kbd>
					<kbd>{formatShortcut("previousConversation")}</kbd> move</span
				><span><kbd>{formatShortcut("openConversation")}</kbd> open</span><span
					><kbd>{formatShortcut("compose")}</kbd> compose</span
				>
			</div>
		</div>{/if}
</div>

<style>
	.conversation {
		height: 100%;
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--color-surface);
	}
	.conversation-toolbar {
		height: 55px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 23px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}
	.toolbar-group {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.toolbar-divider {
		width: 1px;
		height: 16px;
		background: var(--color-border);
		margin: 0 10px;
	}
	.conversation-label {
		font-size: 10px;
		color: var(--color-faint);
		margin-left: auto;
		margin-right: 12px;
	}
	.back-button {
		display: none;
	}
	.conversation-scroll {
		padding: 34px 36px 20px;
		overflow: auto;
		flex: 1;
	}
	.subject-heading {
		margin-bottom: 34px;
	}
	.subject-heading h1 {
		font-size: 23px;
		line-height: 1.4;
		font-weight: 550;
		letter-spacing: -0.6px;
		margin: 8px 0;
	}
	.message-count {
		font-size: 10px;
		color: var(--color-faint);
	}
	article {
		padding-bottom: 26px;
		margin-bottom: 25px;
		border-bottom: 1px solid var(--color-border);
	}
	.message-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 25px;
	}
	.sender-avatar {
		width: 33px;
		height: 33px;
		border-radius: 11px;
		font-size: 11px;
	}
	.sender-info {
		flex: 1;
		min-width: 0;
	}
	.sender-info strong {
		font-size: 12px;
		font-weight: 600;
	}
	.sender-address {
		color: var(--color-faint);
		font-size: 10px;
		margin-left: 6px;
	}
	.recipients {
		font-size: 10px;
		color: var(--color-muted);
		margin-top: 3px;
		overflow-wrap: anywhere;
	}
	.message-header time {
		font-size: 9px;
		color: var(--color-muted);
		white-space: nowrap;
	}
	.inline-reply {
		width: 26px;
		height: 26px;
	}
	.plain-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 12px;
		line-height: 1.95;
		color: var(--color-text);
		padding-left: 43px;
	}
	iframe {
		border: 0;
		width: 100%;
		background: white;
		border-radius: 4px;
		height: 1px;
		display: block;
	}
	.image-notice {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--color-surface-subtle);
		border-radius: 5px;
		padding: 8px 10px;
		font-size: 9px;
		color: var(--color-muted);
		margin-bottom: 18px;
		flex-wrap: wrap;
	}
	.image-notice button {
		border: 0;
		background: transparent;
		padding: 0;
		color: var(--color-primary);
		font-size: 9px;
	}
	.attachments {
		margin-top: 25px;
		padding-left: 43px;
	}
	.attachment-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 10px;
		color: var(--color-muted);
		margin-bottom: 12px;
	}
	.attachment-list {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
	.attachment-card {
		display: flex;
		align-items: center;
		gap: 10px;
		text-align: left;
		border: 1px solid var(--color-border);
		background: var(--color-surface-subtle);
		border-radius: 9px;
		padding: 12px;
		color: var(--color-muted);
		max-width: 100%;
	}
	.attachment-card > span:nth-child(2) {
		min-width: 0;
	}
	.attachment-card b {
		display: block;
		font-size: 10px;
		color: var(--color-text);
		font-weight: 550;
		max-width: 180px;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}
	.attachment-card small {
		display: block;
		font-size: 9px;
		margin-top: 3px;
	}
	.file-icon {
		color: var(--color-primary);
		padding: 8px;
		background: var(--color-primary-light);
		border-radius: 6px;
	}
	.reply-actions {
		display: flex;
		gap: 9px;
		flex-wrap: wrap;
		padding-left: 43px;
	}
	.reply-actions .button {
		font-size: 11px;
		min-height: 35px;
	}
	.reply-actions kbd {
		margin-left: 8px;
	}
	.reader-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		color: var(--color-faint);
		gap: 16px;
		padding: 30px;
		text-align: center;
	}
	.reader-state p {
		font-size: 12px;
		margin: 0;
		color: var(--color-muted);
	}
	.empty-reader {
		background: radial-gradient(ellipse at 50% 40%, var(--color-surface-subtle), transparent 60%);
	}
	.empty-reader-art {
		width: 110px;
		height: 100px;
		display: grid;
		place-items: center;
		color: #aaa9d3;
		position: relative;
		background: var(--color-bg);
		border-radius: 32px;
		transform: rotate(-5deg);
		margin-bottom: 8px;
	}
	.small-spark {
		position: absolute;
		right: 0;
		top: -8px;
		color: var(--color-primary);
		font-size: 22px;
	}
	.reader-shortcuts {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 18px;
		margin-top: 24px;
	}
	.reader-shortcuts span {
		font-size: 9px;
		display: flex;
		gap: 5px;
		align-items: center;
	}
	@media (max-width: 1150px) {
		.back-button {
			display: flex;
		}
		.conversation-scroll {
			padding: 28px 24px;
		}
		.sender-address {
			display: none;
		}
	}
	@media (max-width: 600px) {
		.conversation-scroll {
			padding: 24px 18px;
		}
		.plain-text,
		.attachments,
		.reply-actions {
			padding-left: 0;
		}
		.message-header time {
			font-size: 8px;
		}
		.subject-heading h1 {
			font-size: 21px;
		}
		.conversation-toolbar {
			padding: 0 12px;
		}
	}
</style>
