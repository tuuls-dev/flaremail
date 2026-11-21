<script lang="ts">
	import type { Mailbox, Member, Domain, Result } from "@flaremail/contracts";
	import Dialog from "../../components/ui/Dialog.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { query, mutate, describeError } from "../../sdk/client";
	import { runAdminAction } from "./actions";
	let {
		orgId,
		mailboxes,
		domains,
		members,
		onrefresh,
	}: {
		orgId: string;
		mailboxes: Mailbox[];
		domains: Domain[];
		members: Member[];
		onrefresh: () => void;
	} = $props();
	let createOpen = $state(false);
	let accessOpen = $state(false);
	let activeMailbox = $state<Mailbox | null>(null);
	let mailboxName = $state("");
	let localPart = $state("");
	let domainId = $state("");
	let targetUserId = $state("");
	let grants = $state<Result<"mailboxes.grants">>([]);
	let errorMessage = $state("");
	let saving = $state(false);

	async function createMailbox(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		errorMessage = "";

		try {
			await mutate("mailboxes.create", { orgId, domainId, localPart, name: mailboxName });
			createOpen = false;
			localPart = "";
			mailboxName = "";
			onrefresh();
		} catch (error) {
			errorMessage = describeError(error);
		} finally {
			saving = false;
		}
	}

	async function loadGrants() {
		if (activeMailbox) {
			grants = await query("mailboxes.grants", { mailboxId: activeMailbox.id });
		}
	}

	async function openAccess(mailbox: Mailbox) {
		activeMailbox = mailbox;
		mailboxName = mailbox.name;
		grants = [];
		targetUserId = "";
		errorMessage = "";
		accessOpen = true;

		try {
			await loadGrants();
		} catch (error) {
			errorMessage = describeError(error);
		}
	}

	async function grantAccess(event: SubmitEvent) {
		event.preventDefault();

		if (!activeMailbox) {
			return;
		}

		const mailboxId = activeMailbox.id;
		await runAdminAction(
			() => mutate("mailboxes.grant", { mailboxId, userId: targetUserId }),
			() => {
				targetUserId = "";
				void loadGrants();
				onrefresh();
			},
			"Mailbox access granted",
		);
	}

	async function revokeAccess(userId: string) {
		if (!activeMailbox) {
			return;
		}

		const mailboxId = activeMailbox.id;
		await runAdminAction(
			() => mutate("mailboxes.revoke", { mailboxId, userId }),
			() => {
				targetUserId = "";
				void loadGrants();
				onrefresh();
			},
			"Mailbox access revoked",
		);
	}

	async function renameMailbox(event: SubmitEvent) {
		event.preventDefault();

		if (!activeMailbox) {
			return;
		}

		try {
			await mutate("mailboxes.update", {
				mailboxId: activeMailbox.id,
				name: mailboxName,
				disabled: activeMailbox.disabled,
			});
			activeMailbox = Object.assign({}, activeMailbox, { name: mailboxName });
			onrefresh();
		} catch (error) {
			errorMessage = describeError(error);
		}
	}
</script>

<section class="panel">
	<header>
		<div>
			<h2>Mailboxes</h2>
		</div>
		<button
			class="button small"
			disabled={!domains.length}
			onclick={() => {
				domainId = domains[0]?.id ?? "";
				errorMessage = "";
				createOpen = true;
			}}><Icon name="plus" size={15} />Create mailbox</button
		>
	</header>
	{#if !mailboxes.length}<div class="empty">
			<Icon name="inbox" size={28} /><strong>No mailboxes</strong>
			<p>
				{domains.length
					? "Create a mailbox, then assign the people who can read and send from it."
					: "Add a domain first. Your mailboxes will appear here."}
			</p>
		</div>{:else}{#each mailboxes as mailbox (mailbox.id)}<div class="mailbox-row">
				<div class="mailbox-icon"><Icon name="inbox" /></div>
				<div class="detail"><strong>{mailbox.name}</strong><small>{mailbox.address}</small></div>
				{#if mailbox.disabled}<span class="badge warning">Disabled</span>{/if}<button
					class="button small"
					onclick={() => openAccess(mailbox)}><Icon name="users" size={14} />Access</button
				><button
					class="button small subtle"
					onclick={() =>
						runAdminAction(
							() =>
								mutate("mailboxes.update", {
									mailboxId: mailbox.id,
									name: mailbox.name,
									disabled: !mailbox.disabled,
								}),
							onrefresh,
							"Mailbox updated",
						)}>{mailbox.disabled ? "Enable" : "Disable"}</button
				>
			</div>{/each}{/if}
</section>
<Dialog
	bind:open={createOpen}
	title="Create a mailbox"
	description="Mailboxes don’t grant access automatically—not even to administrators."
	><form class="form-stack" onsubmit={createMailbox}>
		<label class="field"
			>Mailbox name<input
				bind:value={mailboxName}
				required
				placeholder="Team inbox"
				maxlength="100"
			/></label
		>
		<div class="form-row">
			<label class="field"
				>Address<input
					bind:value={localPart}
					required
					placeholder="hello"
					pattern={"[a-zA-Z0-9][a-zA-Z0-9._+\\-]{0,63}"}
				/></label
			><label class="field"
				>Domain<select bind:value={domainId} required
					>{#each domains as domain}<option value={domain.id}>@{domain.name}</option>{/each}</select
				></label
			>
		</div>
		{#if errorMessage}<div class="form-error" role="alert">{errorMessage}</div>{/if}
		<div class="form-actions">
			<button type="button" class="button" onclick={() => (createOpen = false)}>Cancel</button
			><button class="button primary" disabled={saving}
				>{saving ? "Creating…" : "Create mailbox"}</button
			>
		</div>
	</form></Dialog
>
<Dialog
	bind:open={accessOpen}
	title="Mailbox access"
	description={`${activeMailbox?.address ?? ""} · Everyone listed can read and send from this mailbox.`}
	>{#if errorMessage}<div class="form-error" role="alert">{errorMessage}</div>{/if}
	<form class="mailbox-name-form" onsubmit={renameMailbox}>
		<label class="field"
			>Mailbox name<input bind:value={mailboxName} required maxlength="100" /></label
		><button class="button small">Save name</button>
	</form>
	<div class="access-list">
		{#each grants as grant (grant.id)}<div class="access-row">
				<span class="avatar">{grant.name.slice(0, 2).toUpperCase()}</span>
				<div><b>{grant.name}</b><small>{grant.email}</small></div>
				<button
					class="icon-button"
					aria-label={`Revoke access for ${grant.name}`}
					onclick={() => revokeAccess(grant.id)}><Icon name="close" size={16} /></button
				>
			</div>{:else}<p class="caption">
				No one has access yet. Add yourself or a team member below.
			</p>{/each}
	</div>
	<form class="form-stack" onsubmit={grantAccess}>
		<label class="field"
			>Give access to<select bind:value={targetUserId} required
				><option value="" disabled>Choose an active organization member</option
				>{#each members.filter((member) => !member.disabled && !grants.some((grant) => grant.id === member.id)) as member}<option
						value={member.id}>{member.name} · {member.email}</option
					>{/each}</select
			></label
		>
		<p class="caption">
			This grants read and send access to <strong>{activeMailbox?.address}</strong>.
		</p>
		<div class="form-actions">
			<button class="button primary" disabled={!targetUserId}
				><Icon name="plus" size={15} />Grant access</button
			>
		</div>
	</form></Dialog
>

<style>
	.mailbox-name-form {
		display: flex;
		align-items: end;
		gap: 10px;
		margin-bottom: 18px;
	}
	.mailbox-name-form .field {
		flex: 1;
	}
	.panel {
		border: 1px solid var(--color-border);
		border-radius: 14px;
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 22px 24px;
		border-bottom: 1px solid var(--color-border);
		gap: 16px;
	}
	h2 {
		font-size: 15px;
		margin: 0 0 4px;
	}
	.empty {
		padding: 40px;
		display: flex;
		align-items: center;
		flex-direction: column;
		color: var(--color-faint);
		text-align: center;
	}
	.empty strong {
		color: var(--color-text);
		font-size: 13px;
		margin: 14px 0 7px;
	}
	.empty p {
		font-size: 12px;
		color: var(--color-muted);
		max-width: 330px;
		margin: 0;
	}
	.mailbox-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 24px;
		border-bottom: 1px solid var(--color-border);
	}
	.mailbox-row:last-child {
		border: 0;
	}
	.mailbox-icon {
		padding: 10px;
		background: var(--color-primary-light);
		color: var(--color-primary);
		border-radius: 10px;
	}
	.detail {
		flex: 1;
		min-width: 0;
	}
	.detail strong {
		font-weight: 550;
		font-size: 12px;
	}
	.detail small {
		display: block;
		font-size: 11px;
		color: var(--color-muted);
		margin-top: 3px;
	}
	.access-list {
		margin: 0 0 24px;
	}
	.access-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.access-row > div {
		flex: 1;
	}
	.access-row b {
		font-size: 12px;
		font-weight: 550;
	}
	.access-row small {
		display: block;
		color: var(--color-muted);
		font-size: 11px;
	}
	@media (max-width: 600px) {
		header,
		.mailbox-row {
			padding: 16px;
		}
		.mailbox-icon {
			display: none;
		}
	}
</style>
