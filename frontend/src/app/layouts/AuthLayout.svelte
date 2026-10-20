<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "../../components/ui/Icon.svelte";
	let { children }: { children: Snippet } = $props();
</script>

<div class="auth-layout">
	<aside>
		<a class="brand" href="/"
			><span class="brand-mark"><Icon name="mail" size={22} /></span>flaremail<span
				class="brand-dot">.</span
			></a
		>
		<div class="intro">
			<span class="eyebrow">A quieter kind of inbox</span>
			<h1>Your mail.<br />Your space.</h1>
			<p>A thoughtful place for conversations.<br />Built for your team. Run on your terms.</p>
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
				<div class="floating-note"><Icon name="checks" size={16} /> A little more clarity.</div>
			</div>
		</div>
		<footer><span>Made for focus, not noise.</span><span>Self-hosted. Always yours.</span></footer>
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
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 23px;
		font-weight: 650;
		letter-spacing: -1px;
	}
	.brand-dot {
		color: #7372d7;
		margin-left: -9px;
	}
	.intro {
		margin: auto 0;
		padding: 48px 0;
	}
	.intro .eyebrow {
		color: #7779a4;
	}
	.intro h1 {
		font-size: clamp(40px, 5vw, 68px);
		letter-spacing: -3px;
		font-weight: 550;
		margin: 18px 0 22px;
		line-height: 1.1;
	}
	.intro p {
		color: #7b7d99;
		line-height: 1.8;
	}
	.illustration {
		margin: 48px 0 20px;
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
	.floating-note {
		position: absolute;
		right: -24px;
		bottom: -8px;
		display: flex;
		gap: 8px;
		align-items: center;
		background: white;
		padding: 12px 18px;
		border-radius: 10px;
		box-shadow: 0 4px 24px #3333510e;
		font-size: 11px;
		transform: rotate(6deg);
	}
	footer {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: #9192af;
		gap: 12px;
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
		}
		aside {
			padding: 24px;
			background: var(--color-bg);
		}
		.intro,
		footer {
			display: none;
		}
		main {
			padding: 32px 24px;
		}
		.brand {
			font-size: 20px;
		}
	}
</style>
