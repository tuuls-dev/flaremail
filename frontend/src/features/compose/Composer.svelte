<script lang="ts">
	import { onMount, onDestroy, untrack } from "svelte";
	import type { DraftInput, Draft, Mailbox, Attachment } from "@flaremail/contracts";
	import { blockNavigation } from "sv-router";
	import { toast } from "svelte-sonner";
	import Dialog from "../../components/ui/Dialog.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import RichEditor from "./RichEditor.svelte";
	import { ComposeModel } from "./model.svelte";
	import { formatFileSize } from "../../sdk/attachments";
	import { describeError } from "../../sdk/client";
	import { formatShortcut, matchShortcut, hasOpenShortcutOverlay } from "../../keyboard/shortcuts";
	let {
		initialDraft,
		mailbox,
		forwardAttachments = [],
		sendStatus,
		onclose,
		onsent,
	}: {
		initialDraft: DraftInput;
		forwardAttachments?: Attachment[];
		mailbox: Mailbox;
		sendStatus?: Draft["sendStatus"];
		onclose: () => void;
		onsent: () => void;
	} = $props();
	const model = untrack(() => new ComposeModel(initialDraft, sendStatus));
	let open = $state(true);
	let showCc = $state(false);
	let discardOpen = $state(false);
	let closeUnsavedOpen = $state(false);
	let fileInput: HTMLInputElement;
	const initialHtml = untrack(() => initialDraft.html);
	const busy = $derived.by(() => model.sending || model.uploading);
	$effect(() => {
		const signature = model.describeContent();
		untrack(() => model.scheduleSave(signature));
	});
	onMount(() => {
		showCc = initialDraft.cc.length > 0 || initialDraft.bcc.length > 0;
		void (async () => {
			await model.loadAttachmentDetails();

			if (forwardAttachments.length) {
				await model.copyForwardedAttachments(forwardAttachments);
			}
		})().catch((error) => {
			model.errorMessage = describeError(error);
		});
		return blockNavigation({
			beforeUnload() {
				return model.locked || model.saveStatus === "saved";
			},
			async onNavigate() {
				if (model.sending || model.uploading) {
					return false;
				}

				if (model.locked) {
					return true;
				}

				try {
					await model.save();
					return true;
				} catch {
					return false;
				}
			},
		});
	});

	onDestroy(() => model.destroy());

	async function closeComposer() {
		if (busy) {
			return;
		}

		if (model.locked) {
			onclose();
			return;
		}

		try {
			await model.save();
			onclose();
		} catch {
			closeUnsavedOpen = true;
		}
	}

	async function sendMessage() {
		if (await model.send()) {
			toast.success("Message accepted for delivery");
			onsent();
			onclose();
		}
	}

	async function discardMessage() {
		try {
			await model.discard();
			toast("Draft discarded");
			onclose();
		} catch (error) {
			model.errorMessage = describeError(error);
			discardOpen = false;
		}
	}

	function handleSendShortcut(event: KeyboardEvent) {
		const cannotSend = [discardOpen, closeUnsavedOpen, busy, model.locked, !open].some(Boolean);

		if (cannotSend || matchShortcut(event, "composer") !== "send") {
			return;
		}

		const activeDialog =
			event.target instanceof HTMLElement ? event.target.closest('[role="dialog"]') : null;

		if (!activeDialog?.querySelector("#compose-to")) {
			return;
		}

		if (hasOpenShortcutOverlay(activeDialog)) {
			return;
		}

		event.preventDefault();
		void sendMessage();
	}
</script>

<svelte:window onkeydown={handleSendShortcut} />
<Dialog
	bind:open
	title={model.replyToMessageId ? "Reply" : "New message"}
	wide
	preventClose={busy}
	onrequestclose={() => {
		void closeComposer();
	}}
	><div class="composer">
		<div class="from-row">
			<span>From</span><span class="sender-chip"><Icon name="at" size={12} />{mailbox.address}</span
			><span class="save-status" aria-live="polite"
				>{model.saveStatus === "saving"
					? "Saving…"
					: model.saveStatus === "saved"
						? "Draft saved"
						: model.saveStatus === "error"
							? "Not saved"
							: "Unsaved changes"}</span
			>
		</div>
		<div class="recipient-row">
			<label for="compose-to">To</label><input
				id="compose-to"
				bind:value={model.toText}
				placeholder="name@example.com"
				disabled={model.locked || busy}
				autocomplete="off"
			/><button type="button" onclick={() => (showCc = !showCc)}
				>{showCc ? "Hide" : "Cc Bcc"}</button
			>
		</div>
		{#if showCc}<div class="recipient-row">
				<label for="compose-cc">Cc</label><input
					id="compose-cc"
					bind:value={model.ccText}
					disabled={model.locked || busy}
				/>
			</div>
			<div class="recipient-row">
				<label for="compose-bcc">Bcc</label><input
					id="compose-bcc"
					bind:value={model.bccText}
					disabled={model.locked || busy}
				/>
			</div>{/if}
		<div class="subject-row">
			<label class="sr-only" for="compose-subject">Subject</label><input
				id="compose-subject"
				bind:value={model.subject}
				placeholder="Subject"
				disabled={model.locked || busy}
				maxlength="998"
			/>
		</div>
		<RichEditor
			{initialHtml}
			onchange={(html, text) => {
				model.html = html;
				model.text = text;
			}}
			disabled={model.locked || busy}
		/>{#if model.attachments.length}<div class="compose-attachments">
				{#each model.attachments as attachment (attachment.id)}<span class="attachment"
						><Icon name="attachment" size={13} /><span
							>{attachment.filename}<small>{formatFileSize(attachment.size)}</small></span
						><button
							class="icon-button"
							aria-label={`Remove ${attachment.filename}`}
							disabled={model.locked || busy}
							onclick={() => model.removeAttachment(attachment.id)}
							><Icon name="close" size={13} /></button
						></span
					>{/each}
			</div>{/if}{#if model.uploading}<p class="caption" role="status">
				Uploading {model.uploadProgress}
			</p>{/if}{#if model.errorMessage}<div class="form-error" role="alert">
				{model.errorMessage}
			</div>{/if}
		<div class="compose-footer">
			<button
				class="button primary send-button"
				onclick={sendMessage}
				disabled={busy || model.locked}
				><Icon name="send" size={15} />{model.sending ? "Sending…" : "Send message"}<kbd
					>{formatShortcut("send")}</kbd
				></button
			><button
				class="icon-button"
				title="Attach files"
				aria-label="Attach files"
				disabled={busy || model.locked}
				onclick={() => fileInput.click()}><Icon name="attachment" size={19} /></button
			><input
				class="sr-only"
				type="file"
				multiple
				bind:this={fileInput}
				onchange={(event) => {
					if (event.currentTarget.files) {
						void model.uploadFiles(Array.from(event.currentTarget.files));
						event.currentTarget.value = "";
					}
				}}
				aria-label="Choose attachments"
			/><span class="footer-space"></span><button
				class="button subtle small"
				onclick={closeComposer}
				disabled={busy}>{model.locked ? "Close" : "Save & close"}</button
			><button
				class="icon-button discard-button"
				aria-label="Discard draft"
				disabled={busy || model.locked}
				onclick={() => (discardOpen = true)}><Icon name="trash" size={17} /></button
			>
		</div>
	</div></Dialog
>
<Dialog
	bind:open={discardOpen}
	title="Discard this draft?"
	description="This permanently removes the draft. Sent mail and other conversations are not affected."
	><div class="form-actions">
		<button class="button" onclick={() => (discardOpen = false)}>Keep writing</button><button
			class="button danger"
			onclick={discardMessage}>Discard draft</button
		>
	</div></Dialog
>

<Dialog
	bind:open={closeUnsavedOpen}
	title="This version hasn’t been saved"
	description="Your local edits could not be saved. You can keep editing or deliberately leave this local version. The last saved server draft will be retained."
	><div class="form-actions">
		<button class="button" onclick={() => (closeUnsavedOpen = false)}>Keep editing</button><button
			class="button danger"
			onclick={onclose}>Leave without saving</button
		>
	</div></Dialog
>

<style>
	.composer {
		margin-top: -8px;
	}
	.from-row {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 11px;
		color: var(--color-muted);
		padding-bottom: 16px;
	}
	.sender-chip {
		display: flex;
		align-items: center;
		gap: 5px;
		background: var(--color-bg);
		padding: 5px 8px;
		border-radius: 5px;
		color: var(--color-text);
		font-size: 10px;
	}
	.save-status {
		margin-left: auto;
		font-size: 10px;
		color: var(--color-faint);
	}
	.recipient-row {
		display: flex;
		align-items: center;
		gap: 10px;
		border-top: 1px solid var(--color-border);
		padding: 11px 0;
		font-size: 12px;
	}
	.recipient-row label {
		width: 24px;
		color: var(--color-muted);
	}
	.recipient-row input {
		border: 0;
		outline: none;
		min-width: 0;
		flex: 1;
		background: transparent;
		color: var(--color-text);
		font-size: 12px;
	}
	.recipient-row button {
		font-size: 10px;
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--color-muted);
	}
	.subject-row {
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
		padding: 13px 0;
	}
	.subject-row input {
		border: 0;
		outline: none;
		background: transparent;
		color: var(--color-text);
		font-size: 13px;
		font-weight: 550;
		width: 100%;
	}
	.compose-footer {
		display: flex;
		align-items: center;
		gap: 10px;
		border-top: 1px solid var(--color-border);
		padding-top: 18px;
		margin-top: 8px;
	}
	.send-button {
		font-size: 12px;
		min-height: 39px;
	}
	.send-button kbd {
		background: #ffffff20;
		border-color: #ffffff25;
		color: white;
		margin-left: 8px;
	}
	.footer-space {
		flex: 1;
	}
	.discard-button:hover {
		color: var(--color-danger);
	}
	.compose-attachments {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 12px 0;
	}
	.attachment {
		display: flex;
		gap: 7px;
		align-items: center;
		border: 1px solid var(--color-border);
		border-radius: 7px;
		padding: 5px 6px 5px 10px;
		color: var(--color-muted);
		font-size: 10px;
	}
	.attachment small {
		margin-left: 6px;
		color: var(--color-faint);
	}
	.attachment .icon-button {
		width: 24px;
		height: 24px;
	}
	@media (max-width: 600px) {
		.save-status {
			font-size: 9px;
		}
		.send-button kbd {
			display: none;
		}
		.compose-footer {
			gap: 6px;
		}
		.from-row {
			gap: 7px;
		}
	}
</style>
