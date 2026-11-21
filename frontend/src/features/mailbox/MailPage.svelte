<script lang="ts">
	import { onMount, onDestroy, untrack, tick } from "svelte";
	import { searchParams } from "sv-router";
	import type { DraftInput, Draft, Message, Attachment } from "@flaremail/contracts";
	import Icon from "../../components/ui/Icon.svelte";
	import Dialog from "../../components/ui/Dialog.svelte";
	import Popover from "../../components/ui/Popover.svelte";
	import Sidebar from "../workspace/Sidebar.svelte";
	import Conversation from "./Conversation.svelte";
	import MessageRow from "./MessageRow.svelte";
	import Composer from "../compose/Composer.svelte";
	import { createEmptyDraft, createReplyDraft } from "../compose/create-draft";
	import { MailboxModel } from "./model.svelte";
	import { route, navigate, buildMailboxPath } from "../../app/router";
	import { mutate, describeError } from "../../sdk/client";
	import { shortcuts, isTypingTarget } from "../../keyboard/shortcuts";
	import { toast } from "svelte-sonner";
	const model = new MailboxModel();
	let searchInput: HTMLInputElement;
	let searchText = $state("");
	let searchTimer: ReturnType<typeof setTimeout>;
	let composeDraft = $state<DraftInput | null>(null);
	let forwardAttachments = $state<Attachment[]>([]);
	let composeStatus = $state<Draft["sendStatus"]>(null);
	let helpOpen = $state(false);
	let labelOpen = $state(false);
	let mobileNavOpen = $state(false);
	let labelName = $state("");
	let labelColor = $state("#7774cf");
	let labelError = $state("");
	let focusedIndex = $state(0);
	const orgId = $derived.by(() => route.params.orgId ?? "");
	const mailboxId = $derived.by(() => route.params.mailboxId ?? "");
	const folder = $derived.by(() => route.params.folder ?? "inbox");
	const threadId = $derived.by(() => route.params.threadId ?? "");
	const searchQuery = $derived.by(() => readSearchQuery());
	const labelId = $derived.by(() => readSelectedLabelId());
	const mailbox = $derived(model.workspace.mailboxes.find((item) => item.id === mailboxId));
	const composeMailbox = $derived(
		model.workspace.mailboxes.find((item) => item.id === composeDraft?.mailboxId),
	);
	const folderNames: Record<string, string> = {
		inbox: "Inbox",
		starred: "Starred",
		sent: "Sent",
		drafts: "Drafts",
		archive: "Archive",
		trash: "Trash",
		all: "All mail",
	};
	const heading = $derived.by(() => {
		if (searchQuery) {
			return "Search results";
		}

		if (labelId) {
			return model.labels.find((label) => label.id === labelId)?.name ?? "Label";
		}

		return folderNames[folder] ?? "Inbox";
	});
	$effect(() => {
		const scope = { orgId, mailboxId, folder, search: searchQuery, labelId, threadId };
		untrack(() => {
			if (searchText.trim() !== searchQuery) {
				searchText = searchQuery;
			}

			void model.openScope(scope);
		});
	});
	onMount(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === "visible" && !composeDraft) {
				void model.refreshMailbox();
			}
		}, 15000);
		return () => clearInterval(timer);
	});
	onDestroy(() => {
		model.destroy();
		clearTimeout(searchTimer);
	});

	function refreshOnFocus() {
		if (document.visibilityState === "visible") {
			void model.refreshMailbox();
		}
	}

	function updateSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			if (searchText.trim()) {
				searchParams.set("q", searchText.trim(), { replace: true });
			} else {
				searchParams.delete("q", undefined, { replace: true });
			}
		}, 250);
	}

	function openCompose() {
		if (!mailbox || composeDraft) {
			return;
		}

		forwardAttachments = [];
		composeDraft = createEmptyDraft(mailbox.id);
		composeStatus = null;
		mobileNavOpen = false;
	}

	function openDraft(draft: Draft) {
		if (composeDraft) {
			return;
		}

		forwardAttachments = [];
		composeDraft = draft;
		composeStatus = draft.sendStatus;
	}

	function composeReply(message: Message, mode: "reply" | "replyAll" | "forward") {
		if (!mailbox || composeDraft) {
			return;
		}

		forwardAttachments = mode === "forward" ? message.attachments : [];
		composeDraft = createReplyDraft(mailbox.id, mailbox.address, message, mode);
		composeStatus = null;
	}

	async function createLabel(event: SubmitEvent) {
		event.preventDefault();
		labelError = "";

		try {
			await mutate("labels.create", { mailboxId, name: labelName, color: labelColor });
			labelName = "";
			labelOpen = false;
			await model.refreshMailbox();
		} catch (error) {
			labelError = describeError(error);
		}
	}

	async function closeConversation() {
		const previousThreadId = threadId;
		await navigate("/orgs/:orgId/mailboxes/:mailboxId/:folder", {
			params: { orgId, mailboxId, folder },
			search: readSearchState(),
		});
		await tick();
		document.querySelector<HTMLAnchorElement>(`[data-thread-id="${previousThreadId}"] a`)?.focus();
	}

	function buildConversationHref(conversationId: string) {
		const queryParameters = new URLSearchParams();

		for (const [key, value] of searchParams.entries()) {
			queryParameters.set(key, String(value));
		}

		const queryString = queryParameters.toString();
		const pathname = buildMailboxPath(orgId, mailboxId, folder, conversationId);
		return queryString ? `${pathname}?${queryString}` : pathname;
	}

	function openConversation(index: number) {
		const item = model.items[index];

		if (!item) {
			return;
		}

		focusedIndex = index;
		void navigate("/orgs/:orgId/mailboxes/:mailboxId/:folder/:threadId", {
			params: { orgId, mailboxId, folder, threadId: item.threadId },
			search: readSearchState(),
		});
	}

	function actOnConversation(action: "archive" | "trash") {
		const threadIds = model.selected.length ? model.selected : [threadId].filter(Boolean);
		void model.updateThreads(threadIds, { folder: action });

		if (threadId) {
			closeConversation();
		}
	}

	function readSearchQuery() {
		const searchValue = searchParams.get("q") ?? "";
		return String(searchValue);
	}

	function readSelectedLabelId() {
		const selectedLabelId = searchParams.get("label");
		return selectedLabelId ? String(selectedLabelId) : undefined;
	}

	function readSearchState(): Record<string, string | number | boolean> {
		return Object.fromEntries(searchParams.entries());
	}

	function shouldIgnoreShortcut(event: KeyboardEvent) {
		const hasOpenOverlay = [composeDraft, helpOpen, labelOpen, mobileNavOpen].some(Boolean);
		const usesModifier = event.metaKey || event.ctrlKey || event.altKey;
		return [hasOpenOverlay, usesModifier, isTypingTarget(event.target)].some(Boolean);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (shouldIgnoreShortcut(event)) {
			return;
		}

		const command = event.key.toLowerCase();

		if (command === "c") {
			event.preventDefault();
			openCompose();
			return;
		}

		if (command === "/") {
			event.preventDefault();
			searchInput.focus();
			return;
		}

		if (command === "?") {
			helpOpen = true;
			return;
		}

		handleMailCommand(event, command);
	}

	function handleMailCommand(event: KeyboardEvent, command: string) {
		const targetsControl =
			event.target instanceof HTMLElement && Boolean(event.target.closest("button,a,input,select"));

		if (command === "enter" && targetsControl) {
			return;
		}

		const commands: Record<string, () => void> = {
			j: () => moveFocus(1),
			k: () => moveFocus(-1),
			enter: () => openConversation(focusedIndex),
			x: () => {
				const item = model.items[focusedIndex];

				if (item) {
					model.toggleSelection(item.threadId);
				}
			},
			e: () => actOnConversation("archive"),
			r: () => {
				const message = model.messages.at(-1);

				if (message) {
					composeReply(message, "reply");
				}
			},
			escape: closeConversation,
		};
		const execute = commands[command];

		if (execute) {
			event.preventDefault();
			execute();
		}
	}

	function moveFocus(direction: number) {
		const openIndex = model.items.findIndex((item) => item.threadId === threadId);
		const baseIndex = openIndex >= 0 ? openIndex : focusedIndex;
		const nextIndex = baseIndex + direction;
		const lastItemIndex = model.items.length - 1;
		const maximumIndex = Math.max(0, lastItemIndex);
		focusedIndex = Math.min(maximumIndex, Math.max(0, nextIndex));

		if (threadId) {
			openConversation(focusedIndex);
		} else {
			const item = model.items[focusedIndex];
			document.querySelector<HTMLAnchorElement>(`[data-thread-id="${item?.threadId}"] a`)?.focus();
		}
	}
</script>

<svelte:head><title>{heading} · {mailbox?.address ?? "Flaremail"}</title></svelte:head>
<svelte:window onfocus={refreshOnFocus} onkeydown={handleKeydown} />
<svelte:document onvisibilitychange={refreshOnFocus} />
<div class="mail-app">
	<aside class="desktop-sidebar">
		<Sidebar
			workspace={model.workspace}
			{mailbox}
			{folder}
			counts={model.counts}
			labels={model.labels}
			{labelId}
			oncompose={openCompose}
			onlabel={() => (labelOpen = true)}
			onhelp={() => (helpOpen = true)}
		/>
	</aside>
	<main>
		<header class="topbar">
			<button
				class="icon-button mobile-menu"
				aria-label="Open navigation"
				onclick={() => (mobileNavOpen = true)}><Icon name="menu" /></button
			>
			<form
				class="search-box"
				onsubmit={(event) => {
					event.preventDefault();
					updateSearch();
				}}
			>
				<Icon name="search" size={17} /><input
					bind:this={searchInput}
					bind:value={searchText}
					oninput={updateSearch}
					aria-label="Search this mailbox"
					maxlength="500"
					placeholder="Search your conversations…"
				/><kbd>/</kbd>{#if searchText}<button
						type="button"
						class="icon-button"
						aria-label="Clear search"
						onclick={() => {
							searchText = "";
							searchParams.delete("q", undefined, { replace: true });
						}}><Icon name="close" size={14} /></button
					>{/if}
			</form>
			<div class="topbar-right">
				<button
					class="icon-button"
					aria-label="Keyboard shortcut help"
					onclick={() => (helpOpen = true)}><Icon name="help" size={17} /></button
				><a class="icon-button" href="/settings" aria-label="Account settings"
					><Icon name="settings" size={17} /></a
				>
			</div>
		</header>
		<div class="mail-content" class:conversation-open={Boolean(threadId)}>
			<section class="message-list" aria-label="Conversations">
				<div class="list-heading">
					<div>
						<h1>{heading}<span>{folder === "drafts" ? model.drafts.length : model.total}</span></h1>
						<p>
							{searchQuery ? `Results for “${searchQuery}”` : (mailbox?.name ?? "")}
						</p>
					</div>
					<button
						class="icon-button"
						class:spinning={model.refreshing}
						aria-label="Refresh mailbox"
						onclick={() => model.refreshMailbox()}
						disabled={model.refreshing}><Icon name="refresh" size={15} /></button
					>
				</div>
				<div class="list-toolbar">
					<label class="select-all"
						><input
							type="checkbox"
							checked={model.items.length > 0 && model.selected.length === model.items.length}
							onchange={() => model.selectAll()}
							aria-label="Select all conversations"
						/><Icon name="chevronDown" size={12} /></label
					>{#if model.selected.length}<span class="selection-count"
							>{model.selected.length} selected</span
						><button
							class="icon-button"
							aria-label="Archive selected conversations"
							onclick={() => actOnConversation("archive")}><Icon name="archive" size={15} /></button
						><button
							class="icon-button"
							aria-label="Trash selected conversations"
							onclick={() => actOnConversation("trash")}><Icon name="trash" size={15} /></button
						><button
							class="icon-button"
							aria-label="Mark selected unread"
							onclick={() => model.updateThreads(model.selected, { unread: true })}
							><Icon name="mail" size={15} /></button
						><Popover label="Label selected conversations" align="end"
							>{#snippet trigger()}<Icon name="tag" size={15} />{/snippet}{#snippet children()}<div
									class="menu-label"
								>
									Apply a label
								</div>
								{#each model.labels as label}<button
										class="menu-item"
										onclick={() => model.applyLabel(model.selected, label.id, false)}
										><span class="label-dot" style:background={label.color}
										></span>{label.name}</button
									>{/each}<button class="menu-item" onclick={() => (labelOpen = true)}
									><Icon name="plus" size={14} />Create a label</button
								>{/snippet}</Popover
						>{:else}<span class="list-mode"
							>{folder === "drafts" ? "Only your drafts" : "All conversations"}</span
						><span class="list-toolbar-space"></span><Popover label="Mailbox actions" align="end"
							>{#snippet trigger()}<Icon
									name="more"
									size={17}
								/>{/snippet}{#snippet children()}<button
									class="menu-item"
									onclick={() => {
										const unreadThreadIds = model.items
											.filter((item) => item.unread)
											.map((item) => item.threadId);
										void model.updateThreads(unreadThreadIds, { unread: false });
									}}><Icon name="checks" size={15} />Mark this page read</button
								><button class="menu-item" onclick={() => (helpOpen = true)}
									><Icon name="command" size={15} />Keyboard shortcuts</button
								>{#if labelId}<button
										class="menu-item"
										onclick={async () => {
											try {
												await mutate("labels.remove", { mailboxId, id: labelId! });
												searchParams.delete("label", undefined, { replace: true });
												await model.refreshMailbox();
											} catch (error) {
												toast.error(describeError(error));
											}
										}}><Icon name="trash" size={15} />Remove this label</button
									>{/if}{/snippet}</Popover
						>{/if}
				</div>
				<div class="list-scroll">
					{#if model.errorMessage}<div class="list-error" role="alert">
							<Icon name="cloudOff" size={25} />
							<p>{model.errorMessage}</p>
							<button class="button small" onclick={() => model.refreshMailbox(true)}
								>Try again</button
							>
						</div>{:else if model.loading}<div
							class="skeleton-list"
							aria-label="Loading conversations"
						>
							{#each [1, 2, 3, 4, 5] as placeholder}<div class="skeleton-row">
									<span></span>
									<div><i></i><b></b><em></em></div>
								</div>{/each}
						</div>{:else if folder === "drafts"}{#each model.drafts as draft (draft.id)}<button
								class="draft-row"
								onclick={() => openDraft(draft)}
								><span class="draft-icon"><Icon name="draft" size={18} /></span><span
									><b>{draft.subject || "Untitled draft"}</b><small
										>{draft.to.join(", ") || "No recipients yet"}</small
									><em>{draft.text}</em></span
								><time
									>{new Date(draft.updatedAt).toLocaleDateString([], {
										month: "short",
										day: "numeric",
									})}</time
								></button
							>{:else}<div class="list-empty">
								<Icon name="draft" size={34} />
								<h2>No drafts</h2>
								<button class="button small" onclick={openCompose}>Compose</button>
							</div>{/each}{:else}{#each model.items as message, index (message.threadId)}<MessageRow
								{message}
								href={buildConversationHref(message.threadId)}
								onfocusrow={() => (focusedIndex = index)}
								selected={model.selected.includes(message.threadId)}
								active={threadId === message.threadId}
								ontoggle={() => {
									focusedIndex = index;
									model.toggleSelection(message.threadId);
								}}
								onstar={() =>
									model.updateThreads([message.threadId], { starred: !message.starred })}
							/>{:else}<div class="list-empty">
								<span class="empty-inbox-icon"
									><Icon name={searchQuery ? "search" : "inbox"} size={32} /></span
								>
								<h2>{searchQuery ? "No conversations found" : "No conversations"}</h2>
								{#if searchQuery}<p>Try a different name, subject, or phrase.</p>{/if}
								{#if !searchQuery}<button class="button small" onclick={openCompose}>Compose</button
									>{/if}
							</div>{/each}{/if}
				</div>
				<div class="list-footer">
					<span
						>{folder === "drafts"
							? `${model.drafts.length} ${model.drafts.length === 1 ? "draft" : "drafts"}`
							: model.total
								? `${model.offset + 1}–${Math.min(model.offset + 40, model.total)} of ${model.total}`
								: "0 conversations"}</span
					>
					<div>
						<button
							class="icon-button"
							aria-label="Previous page"
							disabled={!model.offset}
							onclick={() => model.changePage(-1)}><Icon name="chevronLeft" size={14} /></button
						><button
							class="icon-button"
							aria-label="Next page"
							disabled={model.offset + 40 >= model.total}
							onclick={() => model.changePage(1)}><Icon name="chevronRight" size={14} /></button
						>
					</div>
				</div>
			</section>
			<section class="reader" aria-label="Message reader">
				{#key threadId}<Conversation
						messages={model.messages}
						{mailboxId}
						loading={model.threadLoading}
						errorMessage={model.threadError}
						onreply={composeReply}
						onarchive={() => actOnConversation("archive")}
						ontrash={() => actOnConversation("trash")}
						onback={closeConversation}
						onunread={() => {
							void model.updateThreads([threadId], { unread: true });
							closeConversation();
						}}
					/>{/key}
			</section>
		</div>
	</main>
	<button class="button primary mobile-compose" onclick={openCompose} disabled={!mailbox}
		><Icon name="draft" size={17} />Compose</button
	>
</div>
{#if composeDraft && composeMailbox}{#key composeDraft.id}<Composer
			initialDraft={composeDraft}
			{forwardAttachments}
			mailbox={composeMailbox}
			sendStatus={composeStatus}
			onclose={() => {
				composeDraft = null;
				void model.refreshMailbox();
			}}
			onsent={() => {
				void model.refreshMailbox();
			}}
		/>{/key}{/if}
<Dialog
	bind:open={helpOpen}
	title="Keyboard shortcuts"
	description="Keyboard shortcuts work outside text fields. Every action is also available with a pointer."
	><div class="shortcut-list">
		{#each shortcuts as shortcut}<div>
				<span>{shortcut.label}</span><span
					>{#each shortcut.keys as key}<kbd>{key}</kbd>{/each}</span
				>
			</div>{/each}
	</div></Dialog
>
<Dialog
	bind:open={labelOpen}
	title="Create label"
	description="Create a label to group related conversations in this mailbox."
	><form class="form-stack" onsubmit={createLabel}>
		<label class="field"
			>Label name<input
				bind:value={labelName}
				required
				maxlength="100"
				placeholder="Projects, receipts"
			/></label
		><label class="field">Color<input type="color" bind:value={labelColor} /></label
		>{#if labelError}<div class="form-error">{labelError}</div>{/if}
		<div class="form-actions"><button class="button primary">Create label</button></div>
	</form></Dialog
>
<Dialog bind:open={mobileNavOpen} title="Your workspace"
	><div class="mobile-sidebar">
		<Sidebar
			workspace={model.workspace}
			{mailbox}
			{folder}
			counts={model.counts}
			labels={model.labels}
			{labelId}
			oncompose={openCompose}
			onlabel={() => {
				mobileNavOpen = false;
				labelOpen = true;
			}}
			onhelp={() => {
				mobileNavOpen = false;
				helpOpen = true;
			}}
			onnavigate={() => (mobileNavOpen = false)}
		/>
	</div></Dialog
>

<style>
	.mobile-compose {
		display: none;
	}
	@media (max-width: 700px) {
		.mobile-compose {
			display: flex;
			position: fixed;
			right: 20px;
			bottom: 67px;
			z-index: 10;
			min-height: 46px;
			padding: 12px 18px;
			border-radius: 14px;
			box-shadow: var(--shadow-popover);
		}
	}
	.mail-app {
		height: 100dvh;
		display: grid;
		grid-template-columns: 228px 1fr;
		overflow: hidden;
	}
	.desktop-sidebar {
		min-width: 0;
		overflow: auto;
	}
	main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		padding: 0 12px 12px 0;
	}
	.topbar {
		height: 76px;
		display: flex;
		align-items: center;
		gap: 22px;
		padding: 0 20px 0 26px;
		flex-shrink: 0;
	}
	.search-box {
		display: flex;
		gap: 10px;
		align-items: center;
		width: 440px;
		color: var(--color-muted);
		border-radius: 9px;
	}
	.search-box input {
		border: 0;
		background: transparent;
		outline: none;
		color: var(--color-text);
		font-size: 12px;
		width: 100%;
		padding: 12px 0;
	}
	.search-box input::placeholder {
		color: var(--color-faint);
	}
	.search-box kbd {
		background: transparent;
		width: 20px;
		font-size: 10px;
		flex-shrink: 0;
	}
	.topbar-right {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-left: auto;
	}
	.mail-content {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(340px, 39%) 1fr;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 3px 12px #15162902;
	}
	.message-list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid var(--color-border);
		min-width: 0;
	}
	.list-heading {
		height: 85px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 23px 16px;
		flex-shrink: 0;
	}
	.list-heading h1 {
		font-size: 21px;
		font-weight: 600;
		letter-spacing: -0.6px;
		margin: 0 0 5px;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.list-heading h1 span {
		font-size: 10px;
		letter-spacing: 0;
		padding: 2px 6px;
		background: var(--color-bg);
		color: var(--color-muted);
		border-radius: 5px;
		font-weight: 450;
	}
	.list-heading p {
		font-size: 10px;
		color: var(--color-faint);
		margin: 0;
	}
	.list-toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 15px;
		height: 43px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}
	.select-all {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-faint);
		margin-right: 10px;
		cursor: pointer;
	}
	.select-all input {
		width: 13px;
		height: 13px;
		margin: 0;
		accent-color: var(--color-primary);
	}
	.list-mode,
	.selection-count {
		font-size: 10px;
		color: var(--color-muted);
	}
	.selection-count {
		color: var(--color-primary);
		margin-right: auto;
	}
	.list-toolbar-space {
		flex: 1;
	}
	.list-toolbar .icon-button {
		height: 28px;
		width: 28px;
	}
	.list-scroll {
		flex: 1;
		overflow: auto;
		min-height: 0;
	}
	.list-footer {
		height: 47px;
		padding: 0 17px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-top: 1px solid var(--color-border);
		font-size: 9px;
		color: var(--color-faint);
		flex-shrink: 0;
	}
	.list-footer > div {
		display: flex;
		gap: 5px;
	}
	.list-footer .icon-button {
		width: 24px;
		height: 24px;
	}
	.reader {
		min-width: 0;
		min-height: 0;
	}
	.list-empty,
	.list-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: 350px;
		padding: 32px;
		color: var(--color-faint);
		gap: 13px;
	}
	.list-empty h2 {
		font-size: 15px;
		font-weight: 500;
		color: var(--color-text);
		letter-spacing: -0.3px;
		margin: 0;
	}
	.list-empty p,
	.list-error p {
		font-size: 11px;
		line-height: 1.8;
		color: var(--color-muted);
		max-width: 230px;
		margin: 0;
	}
	.list-empty .button {
		margin-top: 10px;
	}
	.empty-inbox-icon {
		padding: 23px;
		background: var(--color-surface-subtle);
		border-radius: 26px;
		margin-bottom: 8px;
	}
	.list-error {
		color: var(--color-danger);
	}
	.draft-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--color-border);
		padding: 22px;
		text-align: left;
		background: var(--color-surface);
		color: var(--color-text);
	}
	.draft-row:hover {
		background: var(--color-surface-subtle);
	}
	.draft-row > span:nth-child(2) {
		flex: 1;
		min-width: 0;
	}
	.draft-icon {
		padding: 9px;
		background: var(--color-primary-light);
		color: var(--color-primary);
		border-radius: 10px;
	}
	.draft-row b {
		font-size: 12px;
		font-weight: 550;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.draft-row small {
		display: block;
		font-size: 10px;
		color: var(--color-muted);
		margin-top: 4px;
	}
	.draft-row em {
		font-size: 10px;
		color: var(--color-faint);
		font-style: normal;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 6px;
	}
	.draft-row time {
		font-size: 9px;
		color: var(--color-faint);
	}
	.skeleton-row {
		display: flex;
		gap: 12px;
		padding: 24px;
		border-bottom: 1px solid var(--color-border);
		animation: pulse 1.5s infinite;
	}
	.skeleton-row > span {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--color-hover);
	}
	.skeleton-row > div {
		flex: 1;
	}
	.skeleton-row i,
	.skeleton-row b,
	.skeleton-row em {
		display: block;
		height: 7px;
		border-radius: 3px;
		background: var(--color-hover);
		margin-bottom: 10px;
		width: 45%;
	}
	.skeleton-row b {
		width: 75%;
	}
	.skeleton-row em {
		width: 90%;
		height: 5px;
	}
	.shortcut-list {
		display: grid;
		gap: 15px;
	}
	.shortcut-list > div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
	}
	.shortcut-list > div > span:last-child {
		display: flex;
		gap: 5px;
	}
	.label-dot {
		width: 7px;
		height: 7px;
		border-radius: 2px;
	}
	.mobile-menu {
		display: none;
	}
	.mobile-sidebar {
		height: 74dvh;
		margin: -20px -12px;
	}
	.spinning :global(svg) {
		animation: rotate 1s linear infinite;
	}
	@keyframes rotate {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes pulse {
		50% {
			opacity: 0.4;
		}
	}
	@media (min-width: 1450px) {
		.mail-content {
			grid-template-columns: 430px 1fr;
		}
		.mail-app {
			grid-template-columns: 244px 1fr;
		}
	}
	@media (max-width: 1150px) {
		.mail-app {
			grid-template-columns: 210px 1fr;
		}
		.mail-content {
			grid-template-columns: 1fr;
		}
		.reader {
			display: none;
		}
		.conversation-open .reader {
			display: block;
		}
		.conversation-open .message-list {
			display: none;
		}
		.message-list {
			border: 0;
		}
		.topbar {
			padding: 0 14px;
			gap: 12px;
		}
	}
	@media (max-width: 700px) {
		.mail-app {
			grid-template-columns: 1fr;
		}
		.desktop-sidebar {
			display: none;
		}
		main {
			padding: 0;
		}
		.topbar {
			height: 62px;
			padding: 0 12px;
		}
		.mobile-menu {
			display: flex;
		}
		.topbar-right .icon-button:first-of-type {
			display: none;
		}
		.search-box {
			width: auto;
			flex: 1;
		}
		.search-box input {
			font-size: 12px;
		}
		.mail-content {
			border-radius: 0;
			border-left: 0;
			border-right: 0;
			border-bottom: 0;
		}
		.topbar-right {
			gap: 0;
		}
		.list-heading {
			height: 80px;
			padding: 18px 20px;
		}
		.list-heading h1 {
			font-size: 23px;
		}
		.search-box kbd {
			display: none;
		}
	}
</style>
