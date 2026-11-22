<script lang="ts">
	import type { Snippet } from "svelte";
	import BrandLink from "../../components/ui/BrandLink.svelte";
	import Icon from "../../components/ui/Icon.svelte";
	let { children }: { children: Snippet } = $props();
</script>

<div class="auth-layout">
	<aside>
		<BrandLink />
		<div class="intro">
			<div class="illustration" aria-hidden="true">
				<div class="illustration-top"><i></i><i></i><i></i></div>
				<div class="illustration-row">
					<span class="mini-avatar violet"></span><span><b></b><em></em></span><Icon
						name="checkCircle"
						size={18}
					/>
				</div>
				<div class="illustration-row">
					<span class="mini-avatar green"></span><span><b></b><em></em></span>
				</div>
				<div class="illustration-row">
					<span class="mini-avatar peach"></span><span><b></b><em></em></span>
				</div>
			</div>
		</div>
	</aside>
	<main>{@render children()}</main>
</div>

<style>
	.auth-layout {
		min-height: 100dvh;
		display: grid;
		grid-template-columns: 43% 57%;
		background: var(--color-surface);
	}
	aside {
		background: #eff0fb;
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 42px 48px;
		color: #30334f;
	}
	.intro {
		margin: auto 0;
		padding: 48px 0;
	}
	.illustration {
		margin: 0;
		background: #ffffffbc;
		border: 1px solid #fff;
		border-radius: 14px;
		max-width: 340px;
		padding: 16px 22px;
		box-shadow: 0 14px 60px #4e4b9b0c;
		transform: rotate(-3deg);
		position: relative;
	}
	.illustration-top {
		display: flex;
		gap: 4px;
		padding-bottom: 18px;
	}
	.illustration-top i {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #d4d6e5;
	}
	.illustration-row {
		display: flex;
		align-items: center;
		gap: 12px;
		border-top: 1px solid #eff0f5;
		padding: 15px 0;
		color: #8584d5;
	}
	.illustration-row > span:nth-child(2) {
		flex: 1;
	}
	.mini-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #e6e2fb;
	}
	.green {
		background: #dceee8;
	}
	.peach {
		background: #fae9df;
	}
	.illustration b,
	.illustration em {
		display: block;
		height: 5px;
		background: #e5e6ed;
		width: 60%;
		border-radius: 3px;
	}
	.illustration em {
		margin-top: 8px;
		width: 90%;
		height: 4px;
		background: #eff0f4;
	}
	main {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 48px 36px;
	}
	@media (max-width: 800px) {
		.auth-layout {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
		aside {
			padding: 24px;
			color: var(--color-text);
			background: var(--color-bg);
		}
		.intro {
			display: none;
		}
		main {
			padding: 32px 24px;
		}
	}
</style>
