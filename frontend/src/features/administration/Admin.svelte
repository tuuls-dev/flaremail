<script lang="ts">
	import { onMount } from "svelte";
	import type { Result } from "@flaremail/contracts";
	import UtilityLayout from "../../app/layouts/UtilityLayout.svelte";
	import Dialog from "../../components/ui/Dialog.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { authState } from "../auth/state.svelte";
	import { query, mutate, describeError } from "../../sdk/client";
	import { navigate, route } from "../../app/router";
	import DomainsPanel from "./DomainsPanel.svelte";
	import MembersPanel from "./MembersPanel.svelte";
	import MailboxesPanel from "./MailboxesPanel.svelte";
	let workspace = $state<Result<"workspace.list">>({ organizations: [], mailboxes: [] });
	let loadError = $state("");
	let workspaceLoaded = $state(false);
	let refreshVersion = $state(0);
	let createOpen = $state(false);
	let renameOpen = $state(false);
	let renameTargetId = $state("");
	let renameValue = $state("");
	let renameError = $state("");
	let organizationName = $state("");
	let createError = $state("");
	let saving = $state(false);
	let activeTab = $state("overview");
	const selectedOrgId = $derived.by(() => route.params.orgId ?? "");
	const organizations = $derived(
		workspace.organizations.filter((organization) => organization.role === "admin"),
	);
	const currentOrg = $derived.by(
		() =>
			organizations.find((organization) => organization.id === selectedOrgId) ?? organizations[0],
	);
	const administrationPromise = $derived.by(() => {
		void refreshVersion;
		const organization = currentOrg;

		if (!organization) {
			return Promise.resolve(null);
		}

		return query("admin.overview", { orgId: organization.id }).then((data) => ({
			organization,
			data,
		}));
	});

	async function loadWorkspace() {
		try {
			workspace = await query("workspace.list", {});
			workspaceLoaded = true;
		} catch (error) {
			loadError = describeError(error);
		}
	}

	function refreshAdministration() {
		refreshVersion += 1;
	}

	async function createOrganization(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		createError = "";

		try {
			const organization = await mutate("organizations.create", { name: organizationName });
			await loadWorkspace();
			createOpen = false;
			organizationName = "";
			await navigate("/admin/:orgId", { params: { orgId: organization.id } });
		} catch (error) {
			createError = describeError(error);
		} finally {
			saving = false;
		}
	}

	async function renameOrganization(event: SubmitEvent) {
		event.preventDefault();
		renameError = "";

		try {
			await mutate("organizations.rename", { orgId: renameTargetId, name: renameValue });
			await loadWorkspace();
			refreshAdministration();
			renameOpen = false;
		} catch (error) {
			renameError = describeError(error);
		}
	}

	onMount(() => {
		void loadWorkspace();
	});
</script>

<svelte:head><title>Administration · Flaremail</title></svelte:head>
<UtilityLayout title="Administration" section="admin"
	><div class="page-heading">
		<div>
			<p class="eyebrow">A little behind the scenes</p>
			<h1>Administration</h1>
			<p class="muted">A well-organized home for your team’s mail.</p>
		</div>
		{#if authState.session?.user.instanceAdmin}<button
				class="button primary"
				onclick={() => (createOpen = true)}><Icon name="plus" size={16} />New organization</button
			>{/if}
	</div>
	{#if loadError}<div class="form-error" role="alert">{loadError}</div>{/if}
	{#if currentOrg}
		<svelte:boundary>
			{#if await administrationPromise}{@const snapshot =
					(await administrationPromise)!}{@const data = snapshot.data}{@const loadedOrg =
					snapshot.organization}{#key loadedOrg.id}<div class="org-bar">
						<span class="org-icon"><Icon name="building" size={19} /></span>
						<div>
							<span class="eyebrow">Managing organization</span><select
								aria-label="Organization to manage"
								value={loadedOrg.id}
								onchange={(event) =>
									navigate("/admin/:orgId", { params: { orgId: event.currentTarget.value } })}
								>{#each organizations as organization}<option value={organization.id}
										>{organization.name}</option
									>{/each}</select
							>
						</div>
						<button
							class="icon-button"
							aria-label="Rename organization"
							onclick={() => {
								renameTargetId = loadedOrg.id;
								renameValue = loadedOrg.name;
								renameError = "";
								renameOpen = true;
							}}><Icon name="draft" size={15} /></button
						>
						<span class="badge"
							>{authState.session?.user.instanceAdmin ? "Instance admin" : "Org admin"}</span
						>
					</div>
					<div class="tabs" role="tablist" aria-label="Administration sections">
						{#each [{ id: "overview", label: "Overview" }, { id: "people", label: "People" }, { id: "mailboxes", label: "Mailboxes" }, { id: "activity", label: "Activity" }] as tab}<button
								role="tab"
								aria-selected={activeTab === tab.id}
								class:active={activeTab === tab.id}
								onclick={() => (activeTab = tab.id)}>{tab.label}</button
							>{/each}
					</div>
					<div class="panels">
						{#if activeTab === "overview"}<div class="summary">
								<div>
									<span class="summary-icon"><Icon name="globe" /></span><strong
										>{data.domains.length}</strong
									><span>Domains</span>
								</div>
								<div>
									<span class="summary-icon"><Icon name="users" /></span><strong
										>{data.members.length}</strong
									><span>People</span>
								</div>
								<div>
									<span class="summary-icon"><Icon name="inbox" /></span><strong
										>{data.mailboxes.length}</strong
									><span>Mailboxes</span>
								</div>
							</div>
							<DomainsPanel
								orgId={loadedOrg.id}
								domains={data.domains}
								onrefresh={refreshAdministration}
							/><MailboxesPanel
								orgId={loadedOrg.id}
								mailboxes={data.mailboxes}
								domains={data.domains}
								members={data.members}
								onrefresh={refreshAdministration}
							/>{:else if activeTab === "people"}<MembersPanel
								orgId={loadedOrg.id}
								members={data.members}
								onrefresh={refreshAdministration}
							/>{:else if activeTab === "mailboxes"}<MailboxesPanel
								orgId={loadedOrg.id}
								mailboxes={data.mailboxes}
								domains={data.domains}
								members={data.members}
								onrefresh={refreshAdministration}
							/>{:else}<section class="activity">
								<h2>Recent activity</h2>
								<p class="caption">
									Administrative changes in {loadedOrg.name}. Message contents are never included.
								</p>
								{#each data.audit as event (event.id)}<div class="event">
										<span class="event-icon"><Icon name="check" size={14} /></span>
										<div>
											<strong>{event.actor}</strong><span
												>{event.action.replaceAll(".", " · ")}</span
											><small>{event.target}</small>
										</div>
										<time>{new Date(event.createdAt).toLocaleString()}</time>
									</div>{:else}<p class="muted">No administrative changes yet.</p>{/each}
							</section>{/if}
					</div>{/key}{/if}{#snippet pending()}<div class="loading">
					Loading organization details…
				</div>{/snippet}{#snippet failed(error, reset)}<div class="form-error" role="alert">
					{describeError(error)}
					<button
						class="button small"
						onclick={() => {
							refreshAdministration();
							reset();
						}}>Try again</button
					>
				</div>{/snippet}
		</svelte:boundary>
	{:else if workspaceLoaded}<div class="empty-org">
			<span class="empty-icon"><Icon name="building" size={32} /></span>
			<h2>
				{authState.session?.user.instanceAdmin
					? "Start with an organization."
					: "No organizations to manage."}
			</h2>
			<p>
				{authState.session?.user.instanceAdmin
					? "An organization brings your people, domains, and mailboxes together. Create one for your company, a project, or just yourself."
					: "Organization administrator access is required to use this space."}
			</p>
			{#if authState.session?.user.instanceAdmin}<button
					class="button primary"
					onclick={() => (createOpen = true)}
					>Create your first organization <Icon name="arrowUpRight" size={16} /></button
				>{/if}
		</div>{/if}
</UtilityLayout>
<Dialog
	bind:open={createOpen}
	title="Create an organization"
	description="A separate space for a team, company, or project. You’ll manage its domains and people here."
	><form class="form-stack" onsubmit={createOrganization}>
		<label class="field"
			>Organization name<input
				bind:value={organizationName}
				required
				maxlength="100"
				placeholder="Acme Studio"
			/></label
		>{#if createError}<div class="form-error" role="alert">{createError}</div>{/if}
		<div class="form-actions">
			<button type="button" class="button" onclick={() => (createOpen = false)}>Cancel</button
			><button class="button primary" disabled={saving}
				>{saving ? "Creating…" : "Create organization"}</button
			>
		</div>
	</form></Dialog
>

<Dialog bind:open={renameOpen} title="Rename organization"
	><form class="form-stack" onsubmit={renameOrganization}>
		<label class="field"
			>Organization name<input bind:value={renameValue} required maxlength="100" /></label
		>{#if renameError}<div class="form-error">{renameError}</div>{/if}
		<div class="form-actions"><button class="button primary">Save name</button></div>
	</form></Dialog
>

<style>
	.page-heading {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		align-items: center;
		margin-bottom: 32px;
	}
	.page-heading h1 {
		margin: 10px 0;
	}
	.page-heading p {
		margin-bottom: 0;
		font-size: 12px;
	}
	.page-heading .eyebrow {
		font-size: 10px;
	}
	.org-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 20px;
		background: var(--color-surface-subtle);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		margin-bottom: 24px;
	}
	.org-icon {
		background: var(--color-primary-light);
		color: var(--color-primary);
		padding: 11px;
		border-radius: 10px;
	}
	.org-bar > div {
		flex: 1;
	}
	.org-bar .eyebrow {
		display: block;
		font-size: 9px;
		margin-bottom: 2px;
	}
	.org-bar select {
		background: transparent;
		border: 0;
		font-size: 14px;
		font-weight: 550;
		max-width: 100%;
		color: var(--color-text);
		padding: 0 24px 0 0;
	}
	.tabs {
		display: flex;
		gap: 24px;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 26px;
	}
	.tabs button {
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--color-muted);
		padding: 12px 2px;
		font-size: 12px;
	}
	.tabs .active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
		font-weight: 550;
	}
	.panels {
		display: grid;
		gap: 24px;
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.summary > div {
		border: 1px solid var(--color-border);
		padding: 20px;
		border-radius: 12px;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px;
	}
	.summary-icon {
		grid-column: 2;
		grid-row: 1 / span 2;
		color: var(--color-faint);
		align-self: center;
	}
	.summary strong {
		font-size: 25px;
		font-weight: 550;
		letter-spacing: -1px;
	}
	.summary > div > span:last-child {
		font-size: 11px;
		color: var(--color-muted);
	}
	.empty-org {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 64px 20px;
	}
	.empty-icon {
		background: var(--color-primary-light);
		color: var(--color-primary);
		border-radius: 24px;
		padding: 24px;
		margin-bottom: 26px;
	}
	.empty-org p {
		max-width: 420px;
		color: var(--color-muted);
		font-size: 13px;
		line-height: 1.8;
		margin-bottom: 24px;
	}
	.loading {
		padding: 40px;
		color: var(--color-muted);
		font-size: 12px;
	}
	.activity {
		border: 1px solid var(--color-border);
		border-radius: 14px;
		padding: 24px;
	}
	.activity h2 {
		font-size: 15px;
	}
	.event {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		border-top: 1px solid var(--color-border);
		padding: 18px 0;
	}
	.event-icon {
		padding: 6px;
		background: var(--color-bg);
		color: var(--color-muted);
		border-radius: 50%;
	}
	.event > div {
		flex: 1;
		min-width: 0;
	}
	.event strong {
		font-size: 12px;
		font-weight: 550;
	}
	.event span:not(.event-icon) {
		font-size: 11px;
		margin-left: 10px;
		color: var(--color-muted);
	}
	.event small {
		display: block;
		font-size: 10px;
		color: var(--color-faint);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.event time {
		font-size: 10px;
		color: var(--color-muted);
	}
	@media (max-width: 600px) {
		.page-heading {
			align-items: flex-start;
			flex-direction: column;
		}
		.summary {
			gap: 8px;
		}
		.summary > div {
			padding: 14px;
		}
		.event time {
			max-width: 80px;
			text-align: right;
		}
		.org-bar > .badge {
			display: none;
		}
		.tabs {
			gap: 20px;
		}
	}
</style>
