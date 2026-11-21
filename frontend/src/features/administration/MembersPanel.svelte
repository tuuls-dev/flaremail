<script lang="ts">
	import type { Member } from "@flaremail/contracts";
	import Dialog from "../../components/ui/Dialog.svelte";
	import Popover from "../../components/ui/Popover.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { mutate, describeError } from "../../sdk/client";
	import { runAdminAction } from "./actions";
	let { orgId, members, onrefresh }: { orgId: string; members: Member[]; onrefresh: () => void } =
		$props();
	let memberOpen = $state(false);
	let resetOpen = $state(false);
	let targetMember = $state<Member | null>(null);
	let useExisting = $state(false);
	let memberName = $state("");
	let emailAddress = $state("");
	let temporaryPassword = $state("");
	let memberRole = $state<"admin" | "member">("member");
	let errorMessage = $state("");
	let saving = $state(false);

	async function addMember(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		errorMessage = "";

		try {
			if (useExisting) {
				await mutate("members.add", { orgId, email: emailAddress, role: memberRole });
			} else {
				await mutate("members.create", {
					orgId,
					name: memberName,
					email: emailAddress,
					password: temporaryPassword,
					role: memberRole,
				});
			}

			memberOpen = false;
			memberName = "";
			emailAddress = "";
			temporaryPassword = "";
			onrefresh();
		} catch (error) {
			errorMessage = describeError(error);
		} finally {
			saving = false;
		}
	}

	async function resetMemberPassword(event: SubmitEvent) {
		event.preventDefault();

		if (!targetMember) {
			return;
		}

		const userId = targetMember.id;
		const changed = await runAdminAction(
			() => mutate("members.resetPassword", { orgId, userId, password: temporaryPassword }),
			onrefresh,
			"Password reset. Share the temporary password securely.",
		);

		if (changed) {
			resetOpen = false;
			temporaryPassword = "";
		}
	}
</script>

<section class="panel">
	<header>
		<div>
			<h2>People</h2>
		</div>
		<button
			class="button small"
			onclick={() => {
				errorMessage = "";
				memberOpen = true;
			}}><Icon name="plus" size={15} />Add person</button
		>
	</header>
	<div class="member-list">
		{#each members as member (member.id)}<div class="member-row">
				<span class="avatar">{member.name.slice(0, 2).toUpperCase()}</span>
				<div class="member-detail">
					<strong
						>{member.name}{#if member.instanceAdmin}<span class="instance-label"
								>Instance admin</span
							>{/if}</strong
					><small>{member.email}</small>
				</div>
				<span class="badge" class:warning={member.disabled}
					>{member.disabled
						? "Access disabled"
						: member.role === "admin"
							? "Org admin"
							: "Member"}</span
				><Popover label={`Manage ${member.name}`} align="end"
					>{#snippet trigger()}<Icon name="more" />{/snippet}{#snippet children()}<div
							class="menu-label"
						>
							{member.name}
						</div>
						<button
							class="menu-item"
							onclick={() =>
								runAdminAction(
									() =>
										mutate("members.role", {
											orgId,
											userId: member.id,
											role: member.role === "admin" ? "member" : "admin",
										}),
									onrefresh,
									"Role updated",
								)}
							><Icon name="shield" size={15} />{member.role === "admin"
								? "Make member"
								: "Make org admin"}</button
						><button
							class="menu-item"
							onclick={() => {
								targetMember = member;
								temporaryPassword = "";
								resetOpen = true;
							}}><Icon name="key" size={15} />Reset password</button
						><button
							class="menu-item"
							onclick={() =>
								runAdminAction(
									() =>
										mutate("members.disable", {
											orgId,
											userId: member.id,
											disabled: !member.disabled,
										}),
									onrefresh,
									"Organization access updated",
								)}
							><Icon name="users" size={15} />{member.disabled
								? "Enable org access"
								: "Disable org access"}</button
						>
						<hr class="menu-divider" />
						<button
							class="menu-item remove"
							onclick={() =>
								runAdminAction(
									() => mutate("members.remove", { orgId, userId: member.id }),
									onrefresh,
									"Person removed from organization",
								)}><Icon name="trash" size={15} />Remove from organization</button
						>{/snippet}</Popover
				>
			</div>{/each}
	</div>
</section>
<Dialog
	bind:open={memberOpen}
	title="Add member"
	description="Organization membership doesn’t grant mailbox access. Assign mailboxes separately."
	><form class="form-stack" onsubmit={addMember}>
		<div class="mode-switch">
			<button type="button" class:active={!useExisting} onclick={() => (useExisting = false)}
				>New account</button
			><button type="button" class:active={useExisting} onclick={() => (useExisting = true)}
				>Existing account</button
			>
		</div>
		{#if !useExisting}<label class="field"
				>Full name<input bind:value={memberName} required maxlength="100" /></label
			>{/if}<label class="field"
			>Sign-in email<input type="email" bind:value={emailAddress} required /></label
		>{#if !useExisting}<label class="field"
				>Temporary password<input
					type="password"
					bind:value={temporaryPassword}
					required
					minlength="12"
					maxlength="128"
					autocomplete="new-password"
				/><small>Share it securely. They’ll change it after signing in.</small></label
			>{/if}<label class="field"
			>Organization role<select bind:value={memberRole}
				><option value="member">Member — use assigned mailboxes</option><option value="admin"
					>Org admin — manage people, domains, and mailboxes</option
				></select
			></label
		>{#if errorMessage}<div class="form-error" role="alert">{errorMessage}</div>{/if}
		<div class="form-actions">
			<button type="button" class="button" onclick={() => (memberOpen = false)}>Cancel</button
			><button class="button primary" disabled={saving}>{saving ? "Adding…" : "Add person"}</button>
		</div>
	</form></Dialog
>
<Dialog
	bind:open={resetOpen}
	title="Reset password"
	description={`Set a temporary password for ${targetMember?.name ?? "this person"}. All their sessions will be signed out.`}
	><form class="form-stack" onsubmit={resetMemberPassword}>
		<label class="field"
			>Temporary password<input
				type="password"
				bind:value={temporaryPassword}
				required
				minlength="12"
				maxlength="128"
				autocomplete="new-password"
			/></label
		>
		<p class="caption">
			An instance admin must reset credentials for users belonging to multiple organizations.
		</p>
		<div class="form-actions"><button class="button primary">Reset password</button></div>
	</form></Dialog
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
	.member-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 24px;
		border-bottom: 1px solid var(--color-border);
	}
	.member-row:last-child {
		border: 0;
	}
	.member-detail {
		flex: 1;
		min-width: 0;
	}
	.member-detail strong {
		font-size: 12px;
		font-weight: 550;
	}
	.member-detail small {
		display: block;
		font-size: 11px;
		color: var(--color-muted);
		margin-top: 3px;
	}
	.instance-label {
		font-size: 9px;
		font-weight: 400;
		color: var(--color-primary);
		margin-left: 7px;
	}
	.remove {
		color: var(--color-danger);
	}
	.mode-switch {
		display: flex;
		background: var(--color-bg);
		padding: 4px;
		border-radius: 9px;
	}
	.mode-switch button {
		flex: 1;
		border: 0;
		border-radius: 6px;
		padding: 8px;
		background: transparent;
		color: var(--color-muted);
		font-size: 12px;
	}
	.mode-switch button.active {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: 0 1px 4px #00000008;
	}
	@media (max-width: 600px) {
		header,
		.member-row {
			padding: 16px;
		}
		.instance-label {
			display: none;
		}
		.member-row .badge {
			font-size: 9px;
		}
	}
</style>
