<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "../../components/ui/Icon.svelte";
	import { authState } from "../../features/auth/state.svelte";
	import { mutate } from "../../sdk/client";
	import { navigate } from "../router";
	let {
		title,
		section = "settings",
		children,
	}: { title: string; section?: string; children: Snippet } = $props();

	async function signOut() {
		await mutate("auth.logout", {});
		authState.session = null;
		await navigate("/login");
	}
</script>

<div class="utility-layout">
	<aside>
		<a class="brand" href="/"
			><span class="brand-mark"><Icon name="mail" size={21} /></span><span
				>flaremail<span class="dot">.</span></span
			></a
		><a class="back" href="/"><Icon name="back" size={15} />Back to mail</a><span class="eyebrow"
			>Your workspace</span
		>
		<nav>
			<a href="/settings" class:active={section === "settings"}
				><Icon name="settings" />Account settings</a
			><a href="/admin" class:active={section === "admin"}><Icon name="shield" />Administration</a>
		</nav>
		<div class="bottom">
			<div class="identity">
				<span class="avatar">{authState.session?.user.name.slice(0, 2).toUpperCase()}</span>
				<div>
					<strong>{authState.session?.user.name}</strong><small
						>{authState.session?.user.email}</small
					>
				</div>
			</div>
			<button class="menu-item" onclick={signOut}><Icon name="logout" size={16} />Sign out</button>
		</div>
	</aside>
	<main>
		<header>
			<span>{authState.instance.name}</span><span class="header-label"
				><Icon name={section === "admin" ? "shield" : "settings"} size={14} />{title}</span
			>
		</header>
		<div class="content">{@render children()}</div>
	</main>
</div>

<style>
	.utility-layout {
		display: grid;
		grid-template-columns: 238px 1fr;
		min-height: 100dvh;
	}
	aside {
		padding: 28px 18px;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
	}
	.brand {
		display: flex;
		gap: 10px;
		align-items: center;
		font-weight: 650;
		font-size: 22px;
		letter-spacing: -0.8px;
		padding: 0 8px;
	}
	.dot {
		color: var(--color-primary);
	}
	.back {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--color-muted);
		margin: 38px 8px 32px;
	}
	aside > .eyebrow {
		padding: 0 12px;
		margin-bottom: 12px;
	}
	nav {
		display: grid;
		gap: 5px;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 11px 13px;
		border-radius: 9px;
		font-size: 12px;
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
	.bottom {
		margin-top: auto;
		padding-top: 40px;
	}
	.identity {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 8px 16px;
	}
	.identity strong {
		font-size: 12px;
		font-weight: 550;
	}
	.identity small {
		display: block;
		font-size: 10px;
		color: var(--color-muted);
	}
	main {
		min-width: 0;
		background: var(--color-surface);
	}
	header {
		height: 70px;
		padding: 0 40px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--color-border);
		font-size: 11px;
		color: var(--color-muted);
	}
	.header-label {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.content {
		max-width: 1100px;
		margin: 0 auto;
		padding: 42px 40px;
	}
	@media (max-width: 760px) {
		.utility-layout {
			grid-template-columns: 1fr;
		}
		aside {
			padding: 16px 20px;
			border-right: 0;
			border-bottom: 1px solid var(--color-border);
			display: block;
		}
		.brand {
			display: none;
		}
		.back {
			margin: 0 0 12px;
		}
		aside > .eyebrow,
		.bottom {
			display: none;
		}
		nav {
			display: flex;
		}
		header {
			display: none;
		}
		.content {
			padding: 28px 20px;
		}
	}
</style>
