<script lang="ts">
	import type { Domain } from "@flaremail/contracts";
	import Dialog from "../../components/ui/Dialog.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { mutate, describeError } from "../../sdk/client";
	import { runAdminAction } from "./actions";
	let { orgId, domains, onrefresh }: { orgId: string; domains: Domain[]; onrefresh: () => void } =
		$props();
	let createOpen = $state(false);
	let setupDomain = $state<Domain | null>(null);
	let setupOpen = $state(false);
	let domainName = $state("");
	let errorMessage = $state("");
	let saving = $state(false);

	async function addDomain(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		errorMessage = "";

		try {
			await mutate("domains.create", { orgId, name: domainName });
			createOpen = false;
			domainName = "";
			onrefresh();
		} catch (error) {
			errorMessage = describeError(error);
		} finally {
			saving = false;
		}
	}

	function openSetup(domain: Domain) {
		setupDomain = domain;
		setupOpen = true;
	}

	async function markReady() {
		if (!setupDomain) {
			return;
		}

		const domainId = setupDomain.id;
		const changed = await runAdminAction(
			() => mutate("domains.ready", { orgId, id: domainId, ready: true }),
			onrefresh,
			"Domain marked ready",
		);

		if (changed) {
			setupOpen = false;
		}
	}
</script>

<section class="panel">
	<header>
		<div>
			<h2>Domains</h2>
		</div>
		<button class="button small" onclick={() => (createOpen = true)}
			><Icon name="plus" size={15} />Add domain</button
		>
	</header>
	{#if !domains.length}<div class="empty">
			<Icon name="globe" size={28} /><strong>No domains</strong>
			<p>Add a domain, configure it in Cloudflare, then create your mailboxes.</p>
		</div>{:else}<div class="domain-list">
			{#each domains as domain (domain.id)}<div class="domain-row">
					<div class="domain-icon"><Icon name="globe" /></div>
					<div class="domain-detail">
						<strong>{domain.name}</strong><small
							>{domain.ready
								? "Manually confirmed by an administrator"
								: "Cloudflare configuration needed"}</small
						>
					</div>
					<span class:success={domain.ready} class:warning={!domain.ready} class="badge"
						>{domain.ready ? "Ready" : "Setup needed"}</span
					><button class="button small subtle" onclick={() => openSetup(domain)}
						>Setup <Icon name="chevronRight" size={13} /></button
					><button
						class="icon-button"
						aria-label={`Remove ${domain.name}`}
						onclick={() =>
							runAdminAction(
								() => mutate("domains.remove", { orgId, id: domain.id }),
								onrefresh,
								"Domain removed",
							)}><Icon name="trash" size={15} /></button
					>
				</div>{/each}
		</div>{/if}
</section>
<Dialog
	bind:open={createOpen}
	title="Add a domain"
	description="Register your domain here. You’ll configure sending and receiving in Cloudflare next."
	><form class="form-stack" onsubmit={addDomain}>
		<label class="field"
			>Domain name<input
				bind:value={domainName}
				required
				placeholder="example.com"
				autocomplete="off"
			/></label
		>{#if errorMessage}<div class="form-error" role="alert">{errorMessage}</div>{/if}
		<div class="form-actions">
			<button type="button" class="button" onclick={() => (createOpen = false)}>Cancel</button
			><button class="button primary" disabled={saving}>{saving ? "Adding…" : "Add domain"}</button>
		</div>
	</form></Dialog
>
<Dialog
	bind:open={setupOpen}
	title={`Set up ${setupDomain?.name ?? "domain"}`}
	description="This checklist is manual. Flaremail does not automatically verify or change your Cloudflare account."
	><ol class="checklist">
		<li>
			<b>Enable Email Sending</b><span
				>Onboard this domain in Cloudflare Email Service and publish the required SPF and DKIM
				records.</span
			>
		</li>
		<li>
			<b>Enable Email Routing</b><span
				>Configure the MX records Cloudflare provides. Route the mailbox addresses or the domain’s
				catch-all to your deployed flaremail Worker.</span
			>
		</li>
		<li>
			<b>Enable live sending</b><span
				>Configure the application’s EMAIL binding, set SEND_MODE to live, and verify your domain’s
				DMARC policy.</span
			>
		</li>
	</ol>
	<a
		class="docs-link"
		href="https://developers.cloudflare.com/email-service/"
		target="_blank"
		rel="noreferrer">Open Cloudflare documentation <Icon name="external" size={13} /></a
	>
	<div class="form-actions">
		{#if setupDomain?.ready}<button
				class="button"
				onclick={() => {
					if (setupDomain) {
						const domainId = setupDomain.id;
						void runAdminAction(
							() => mutate("domains.ready", { orgId, id: domainId, ready: false }),
							onrefresh,
							"Domain marked not ready",
						);
						setupOpen = false;
					}
				}}>Mark not ready</button
			>{:else}<button class="button primary" onclick={markReady}
				><Icon name="check" size={15} />I’ve completed setup</button
			>{/if}
	</div></Dialog
>

<style>
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
	.domain-row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 18px 24px;
		border-bottom: 1px solid var(--color-border);
	}
	.domain-row:last-child {
		border: 0;
	}
	.domain-icon {
		padding: 10px;
		border-radius: 10px;
		background: var(--color-bg);
		color: var(--color-muted);
	}
	.domain-detail {
		flex: 1;
		min-width: 0;
	}
	.domain-detail strong {
		font-size: 12px;
		font-weight: 550;
	}
	.domain-detail small {
		display: block;
		color: var(--color-muted);
		font-size: 10px;
		margin-top: 4px;
	}
	.checklist {
		padding: 0 0 0 20px;
		display: grid;
		gap: 20px;
	}
	.checklist li {
		padding-left: 6px;
		font-size: 12px;
		color: var(--color-primary);
	}
	.checklist b {
		color: var(--color-text);
		display: block;
		font-weight: 550;
		margin-bottom: 5px;
	}
	.checklist span {
		color: var(--color-muted);
		line-height: 1.7;
	}
	.docs-link {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-primary);
		font-size: 12px;
		margin: 24px 0;
	}
	@media (max-width: 600px) {
		header,
		.domain-row {
			padding: 16px;
		}
		.domain-detail small {
			display: none;
		}
		.domain-icon {
			display: none;
		}
		.domain-row {
			gap: 8px;
		}
	}
</style>
