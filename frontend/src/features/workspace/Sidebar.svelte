<script lang="ts">
	import type { Result, Mailbox, Label } from "@flaremail/contracts";
	import Icon from "../../components/ui/Icon.svelte";
	import Popover from "../../components/ui/Popover.svelte";
	import { authState } from "../auth/state.svelte";
	import { buildMailboxPath, navigate } from "../../app/router";
	import { mutate } from "../../sdk/client";
	let {
		workspace,
		mailbox,
		folder,
		counts,
		labels,
		labelId,
		oncompose,
		onlabel,
		onhelp,
		onnavigate = () => {},
	}: {
		workspace: Result<"workspace.list">;
		mailbox: Mailbox | undefined;
		folder: string;
		counts: Result<"mail.counts">;
		labels: Label[];
		labelId?: string;
		oncompose: () => void;
		onlabel: () => void;
		onhelp: () => void;
		onnavigate?: () => void;
	} = $props();
	let switcherOpen = $state(false);
	const folderItems = [
		{ id: "inbox", label: "Inbox", icon: "inbox", counter: "unread" },
		{ id: "starred", label: "Starred", icon: "star", counter: "starred" },
		{ id: "sent", label: "Sent", icon: "send", counter: "sent" },
		{ id: "drafts", label: "Drafts", icon: "draft", counter: "drafts" },
		{ id: "archive", label: "Archive", icon: "archive", counter: null },
		{ id: "trash", label: "Trash", icon: "trash", counter: "trash" },
	] as const;
	const organization = $derived(workspace.organizations.find((item) => item.id === mailbox?.orgId));

	async function signOut() {
		await mutate("auth.logout", {});
		authState.session = null;
		await navigate("/login");
	}
</script>

<div class="sidebar">
	<a class="brand" href="/"
		><span class="brand-mark"><Icon name="mail" size={21} /></span><span
			>flaremail<span class="brand-dot">.</span></span
		></a
	>
	<div class="workspace-switcher">
		<Popover
			label="Switch organization or mailbox"
			triggerClass="workspace-trigger"
			bind:open={switcherOpen}
			>{#snippet trigger()}<span class="workspace-avatar"
					>{(organization?.name || "Workspace").slice(0, 1).toUpperCase()}</span
				><span class="workspace-name"
					><strong>{organization?.name || authState.instance.name}</strong><small
						>{mailbox?.address || "Choose a mailbox"}</small
					></span
				><Icon
					name="switch"
					size={14}
				/>{/snippet}{#snippet children()}{#each workspace.organizations as org}<div
						class="menu-label"
					>
						{org.name}
					</div>
					{#each workspace.mailboxes.filter((item) => item.orgId === org.id) as box}<a
							class="menu-item"
							aria-current={box.id === mailbox?.id ? "true" : undefined}
							href={buildMailboxPath(box.orgId, box.id)}
							onclick={() => {
								switcherOpen = false;
								onnavigate();
							}}
							><Icon name="inbox" size={15} /><span
								>{box.name}<small class="mailbox-address">{box.address}</small></span
							></a
						>{/each}{/each}
				<hr class="menu-divider" />
				<a class="menu-item" href="/admin"><Icon name="shield" size={15} />Manage organizations</a
				>{/snippet}</Popover
		>
	</div>
	<button class="compose-button" onclick={oncompose} disabled={!mailbox}
		><Icon name="plus" size={18} /><span>Compose</span><kbd>C</kbd></button
	>
	<nav aria-label="Mail folders">
		{#each folderItems as item}<a
				onclick={onnavigate}
				href={mailbox ? buildMailboxPath(mailbox.orgId, mailbox.id, item.id) : "#"}
				class:active={folder === item.id && !labelId}
				aria-current={folder === item.id && !labelId ? "page" : undefined}
				><Icon name={item.icon} size={17} /><span>{item.label}</span
				>{#if item.counter && counts[item.counter]}<span class="folder-count"
						>{counts[item.counter]}</span
					>{/if}</a
			>{/each}<a
			onclick={onnavigate}
			href={mailbox ? buildMailboxPath(mailbox.orgId, mailbox.id, "all") : "#"}
			class:active={folder === "all" && !labelId}
			><Icon name="mailOpen" size={17} /><span>All mail</span></a
		>
	</nav>
	<div class="label-heading">
		<span class="eyebrow">Labels</span><button
			class="icon-button"
			aria-label="Create label"
			onclick={onlabel}><Icon name="plus" size={14} /></button
		>
	</div>
	<nav aria-label="Labels" class="label-nav">
		{#each labels as label}<a
				onclick={onnavigate}
				href={mailbox
					? `${buildMailboxPath(mailbox.orgId, mailbox.id, "all")}?label=${encodeURIComponent(label.id)}`
					: "#"}
				class:active={labelId === label.id}
				><span class="label-dot" style:background={label.color}></span><span>{label.name}</span></a
			>{:else}<p class="no-labels">A little order, your way.</p>{/each}
	</nav>
	<div class="sidebar-bottom">
		<button class="shortcut-button" onclick={onhelp}
			><Icon name="command" size={15} /><span>Keyboard shortcuts</span><kbd>?</kbd></button
		>
		<div class="account">
			<Popover label="Account menu" triggerClass="account-trigger" align="start"
				>{#snippet trigger()}<span class="avatar"
						>{authState.session?.user.name.slice(0, 2).toUpperCase()}</span
					><span class="account-name"
						><strong>{authState.session?.user.name}</strong><small>Personal account</small></span
					><Icon name="chevronDown" size={14} />{/snippet}{#snippet children()}<div
						class="account-info"
					>
						<strong>{authState.session?.user.name}</strong><small
							>{authState.session?.user.email}</small
						>
					</div>
					<hr class="menu-divider" />
					<a href="/settings" class="menu-item"
						><Icon name="settings" size={15} />Account settings</a
					><a href="/admin" class="menu-item"><Icon name="shield" size={15} />Administration</a>
					<hr class="menu-divider" />
					<button class="menu-item" onclick={signOut}
						><Icon name="logout" size={15} />Sign out</button
					>{/snippet}</Popover
			>
		</div>
	</div>
</div>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		min-height: 100%;
		height: auto;
		padding: 26px 17px 14px;
		min-width: 0;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 22px;
		font-weight: 650;
		letter-spacing: -0.8px;
		margin: 0 9px 30px;
	}
	.brand-mark {
		height: 35px;
		width: 35px;
		border-radius: 10px;
	}
	.brand-dot {
		color: var(--color-primary);
	}
	.workspace-switcher {
		margin-bottom: 22px;
	}
	:global(.workspace-trigger) {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 9px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		width: 100%;
		text-align: left;
		color: var(--color-muted);
	}
	.workspace-avatar {
		display: grid;
		place-items: center;
		width: 27px;
		height: 29px;
		background: var(--color-bg);
		border-radius: 7px;
		font-size: 12px;
		font-weight: 550;
		color: var(--color-text);
	}
	.workspace-name {
		flex: 1;
		min-width: 0;
	}
	.workspace-name strong {
		display: block;
		font-size: 11px;
		font-weight: 550;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.workspace-name small {
		display: block;
		font-size: 9px;
		margin-top: 3px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.mailbox-address {
		display: block;
		font-size: 9px;
		color: var(--color-muted);
		margin-top: 3px;
	}
	.compose-button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 13px 15px;
		background: var(--color-primary);
		color: var(--color-on-primary);
		border: 0;
		border-radius: 10px;
		width: 100%;
		margin-bottom: 25px;
		font-size: 12px;
		font-weight: 550;
		box-shadow: 0 3px 6px #5555db12;
	}
	.compose-button:hover {
		background: var(--color-primary-hover);
	}
	.compose-button kbd {
		margin-left: auto;
		color: #ffffffa0;
		border-color: #ffffff25;
		background: #ffffff15;
		font-size: 9px;
	}
	nav {
		display: grid;
		gap: 3px;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 38px;
		border-radius: 7px;
		padding: 8px 12px;
		font-size: 11px;
		color: var(--color-muted);
	}
	nav a:hover {
		background: var(--color-hover);
	}
	nav a.active {
		background: var(--color-primary-light);
		color: var(--color-primary);
		font-weight: 550;
	}
	.folder-count {
		margin-left: auto;
		color: var(--color-faint);
		font-size: 10px;
	}
	.active .folder-count {
		color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 8%, transparent);
		padding: 1px 6px;
		border-radius: 4px;
	}
	.label-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 28px 5px 8px 12px;
	}
	.label-heading .eyebrow {
		font-size: 9px;
	}
	.label-heading .icon-button {
		height: 20px;
		width: 20px;
	}
	.label-nav {
		max-height: 24dvh;
		overflow: auto;
	}
	.label-dot {
		width: 7px;
		height: 7px;
		border-radius: 2px;
		margin: 0 5px;
	}
	.no-labels {
		font-size: 10px;
		color: var(--color-faint);
		padding: 7px 12px;
	}
	.sidebar-bottom {
		margin-top: auto;
		padding-top: 30px;
	}
	.shortcut-button {
		display: flex;
		align-items: center;
		gap: 9px;
		border: 0;
		background: transparent;
		color: var(--color-faint);
		padding: 10px 12px;
		width: 100%;
		font-size: 10px;
	}
	.shortcut-button kbd {
		margin-left: auto;
		font-size: 9px;
	}
	.account {
		border-top: 1px solid var(--color-border);
		padding-top: 15px;
		margin-top: 12px;
	}
	:global(.account-trigger) {
		display: flex;
		align-items: center;
		gap: 10px;
		border: 0;
		background: transparent;
		color: var(--color-muted);
		padding: 5px 8px;
		width: 100%;
		text-align: left;
	}
	.account .avatar {
		height: 30px;
		width: 30px;
		font-size: 10px;
		background: #eee6de;
		color: #a18365;
	}
	.account-name {
		flex: 1;
		min-width: 0;
	}
	.account-name strong {
		display: block;
		font-size: 11px;
		color: var(--color-text);
		font-weight: 550;
	}
	.account-name small {
		display: block;
		font-size: 9px;
		margin-top: 3px;
		color: var(--color-faint);
	}
	.account-info {
		padding: 10px;
	}
	.account-info strong {
		font-size: 12px;
		font-weight: 550;
	}
	.account-info small {
		display: block;
		font-size: 10px;
		color: var(--color-muted);
		margin-top: 4px;
	}
	@media (max-height: 760px) {
		.brand {
			margin-bottom: 18px;
		}
		.workspace-switcher {
			margin-bottom: 16px;
		}
		.compose-button {
			margin-bottom: 16px;
		}
		.label-heading {
			margin-top: 18px;
		}
		.sidebar-bottom {
			padding-top: 16px;
		}
	}
</style>
