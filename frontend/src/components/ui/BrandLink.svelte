<a href="/" aria-label="Flaremail home">
	<img src="/favicon.svg" width="36" height="36" alt="" />
	<span class="wordmark"></span>
</a>

<style>
	a {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		width: fit-content;
		flex-shrink: 0;
		color: inherit;
	}
	.wordmark {
		width: 104px;
		height: 24px;
		background-color: currentColor;
		mask: url("/wordmark.svg") left center / contain no-repeat;
	}
	@media (max-width: 480px) {
		a {
			gap: 6px;
		}
		img {
			width: 28px;
			height: 28px;
		}
		.wordmark {
			width: 81px;
		}
	}
</style>
