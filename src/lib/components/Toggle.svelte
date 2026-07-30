<script lang="ts">
	/**
	 * A labelled switch row.
	 */
	let {
		checked = $bindable(false),
		label,
		hint = '',
		disabled = false
	}: { checked?: boolean; label: string; hint?: string; disabled?: boolean } = $props();

	const uid = $props.id();
</script>

<div class="row" class:disabled>
	<span class="text">
		<span class="label" id={uid}>{label}</span>
		{#if hint}<span class="hint">{hint}</span>{/if}
	</span>
	<button
		type="button"
		role="switch"
		class="sw"
		class:on={checked}
		aria-checked={checked}
		aria-labelledby={uid}
		{disabled}
		onclick={() => (checked = !checked)}
	>
		<span class="knob"></span>
	</button>
</div>

<style>
	.row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		padding: 9px 0;
	}
	.row.disabled {
		opacity: 0.45;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.label {
		font-size: 13px;
		color: var(--text);
	}

	.hint {
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--text-faint);
		max-width: 60ch;
	}

	.sw {
		flex: none;
		position: relative;
		width: 32px;
		height: 18px;
		margin-top: 1px;
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface-hover);
		cursor: pointer;
		transition: background-color 140ms ease, border-color 140ms ease;
	}
	.sw:disabled {
		cursor: not-allowed;
	}
	.sw.on {
		background: var(--brand);
		border-color: var(--brand);
	}

	.knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--text-muted);
		transition: transform 140ms cubic-bezier(0.2, 0.8, 0.3, 1), background-color 140ms ease;
	}
	.sw.on .knob {
		transform: translateX(14px);
		background: #fff;
	}
</style>
