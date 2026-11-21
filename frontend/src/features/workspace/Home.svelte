<script lang="ts">
	import { query } from "../../sdk/client";
	import UtilityLayout from "../../app/layouts/UtilityLayout.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { authState } from "../auth/state.svelte";
	import { navigate } from "../../app/router";
	const workspace = query("workspace.list", {});

	async function openWorkspace() {
		const result = await workspace;
		const firstMailbox = result.mailboxes[0];

		if (firstMailbox) {
			await navigate("/orgs/:orgId/mailboxes/:mailboxId/:folder", {
				params: { orgId: firstMailbox.orgId, mailboxId: firstMailbox.id, folder: "inbox" },
			});
		}

		return result;
	}

	const destination = openWorkspace();
</script>

<UtilityLayout title="Workspace"
	><svelte:boundary>
		{#if !(await destination).mailboxes.length}<div class="empty-workspace">
				<div class="welcome-icon"><Icon name="inbox" size={34} /></div>
				<h1>No mailboxes</h1>
				<p>
					{authState.session?.user.instanceAdmin
						? "Create an organization, add a domain, then create a mailbox."
						: "You don’t have access to a mailbox yet. Your organization administrator can assign one to you."}
				</p>
				{#if authState.session?.user.instanceAdmin || (await workspace).organizations.some((organization) => organization.role === "admin")}<a
						class="button primary"
						href="/admin">Set up workspace <Icon name="arrowUpRight" size={16} /></a
					>{/if}
				<div class="steps">
					<span><b>01</b>Organization</span><Icon name="chevronRight" size={14} /><span
						><b>02</b>Domain</span
					><Icon name="chevronRight" size={14} /><span><b>03</b>Mailbox</span>
				</div>
			</div>{/if}{#snippet pending()}<p class="muted">
				Finding your mailboxes…
			</p>{/snippet}{#snippet failed(error)}<div class="form-error">
				{error instanceof Error ? error.message : "Could not load your workspace."}
			</div>{/snippet}
	</svelte:boundary></UtilityLayout
>

<style>
	.empty-workspace {
		padding: 70px 12px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.welcome-icon {
		width: 90px;
		height: 90px;
		background: var(--color-primary-light);
		color: var(--color-primary);
		display: grid;
		place-items: center;
		border-radius: 28px;
		margin-bottom: 32px;
	}
	.empty-workspace h1 {
		margin: 14px 0;
	}
	.empty-workspace p {
		max-width: 440px;
		color: var(--color-muted);
		font-size: 13px;
		line-height: 1.8;
		margin-bottom: 28px;
	}
	.steps {
		display: flex;
		align-items: center;
		gap: 20px;
		margin-top: 64px;
		color: var(--color-faint);
		font-size: 11px;
	}
	.steps b {
		display: block;
		font-size: 10px;
		font-weight: 400;
		margin-bottom: 4px;
		color: var(--color-primary);
	}
	@media (max-width: 500px) {
		.empty-workspace {
			padding: 30px 0;
		}
		.steps {
			gap: 12px;
		}
	}
</style>
