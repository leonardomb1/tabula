<script lang="ts">
	import { untrack } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as m from '$lib/paraglide/messages';
	import { dur } from '$lib/motion';

	interface TemplateOption {
		key: string;
		type: 'text' | 'boolean' | 'list';
		default: string;
		help: string;
	}
	interface TemplateRef {
		slug: string;
		name: string;
		description: string;
		options: TemplateOption[];
	}

	let {
		open = $bindable(false),
		templates = [],
		defaultTemplate = '',
		frontmatter = {},
		exportHref
	}: {
		open?: boolean;
		templates?: TemplateRef[];
		defaultTemplate?: string;
		frontmatter?: Record<string, unknown>;
		exportHref: (slug: string | undefined, options: Record<string, string>) => string;
	} = $props();

	let chosen = $state(untrack(() => defaultTemplate));
	let values = $state<Record<string, string>>({});
	let filter = $state('');
	let input = $state<HTMLInputElement | null>(null);

	const template = $derived(templates.find((t) => t.slug === chosen) ?? null);

	const FILTER_AT = 6;
	const showFilter = $derived(templates.length >= FILTER_AT);

	const matches = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return templates;
		return templates.filter(
			(t) =>
				t.name.toLowerCase().includes(q) ||
				t.slug.includes(q) ||
				t.description.toLowerCase().includes(q)
		);
	});

	function initial(option: TemplateOption): string {
		const fromDoc = frontmatter[option.key];
		if (fromDoc !== undefined && fromDoc !== null) {
			return Array.isArray(fromDoc) ? fromDoc.join(', ') : String(fromDoc);
		}
		return option.default;
	}

	function pick(slug: string) {
		chosen = slug;
		const next: Record<string, string> = {};
		for (const option of templates.find((t) => t.slug === slug)?.options ?? []) {
			next[option.key] = initial(option);
		}
		values = next;
	}

	$effect(() => {
		if (open) untrack(() => pick(chosen));
	});

	$effect(() => {
		if (open && showFilter) input?.focus();
	});

	function close() {
		open = false;
		filter = '';
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
			return;
		}
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

		event.preventDefault();
		const slugs = ['', ...matches.map((t) => t.slug)];
		const at = slugs.indexOf(chosen);
		const next =
			event.key === 'ArrowDown'
				? (at + 1) % slugs.length
				: (at - 1 + slugs.length) % slugs.length;
		pick(slugs[next]);
	}

	const href = $derived(exportHref(chosen || undefined, values));
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="scrim" transition:fade={{ duration: dur(140) }} onclick={close}></div>

	<div class="wrap">
		<div
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-label={m.export_with()}
			transition:scale={{ duration: dur(160), start: 0.97, easing: cubicOut }}
		>
			<header>
				<h2>{m.export_with()}</h2>
				<button type="button" class="close" aria-label={m.settings_close()} onclick={close}>
					<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</header>

			{#if showFilter}
				<div class="field-row">
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
						<circle cx="11" cy="11" r="7" />
						<path d="m20 20-3.5-3.5" />
					</svg>
					<input
						bind:this={input}
						bind:value={filter}
						type="text"
						placeholder={m.template_filter()}
						autocomplete="off"
						spellcheck="false"
					/>
					<span class="count">{m.template_count({ count: matches.length })}</span>
				</div>
			{/if}

			<div class="body">
				<ul class="choices">
					<li>
						<button type="button" class="choice" class:selected={chosen === ''} onclick={() => pick('')}>
							<span class="mark" aria-hidden="true">{chosen === '' ? '●' : '○'}</span>
							<span class="text">
								<span class="name">{m.template_default()}</span>
								<span class="desc">{m.template_default_desc()}</span>
							</span>
						</button>
					</li>
					{#each matches as t (t.slug)}
						<li>
							<button
								type="button"
								class="choice"
								class:selected={chosen === t.slug}
								onclick={() => pick(t.slug)}
							>
								<span class="mark" aria-hidden="true">{chosen === t.slug ? '●' : '○'}</span>
								<span class="text">
									<span class="name">
										{t.name}
										{#if t.slug === defaultTemplate}<em>{m.template_doc_default()}</em>{/if}
									</span>
									{#if t.description}<span class="desc">{t.description}</span>{/if}
								</span>
							</button>
						</li>
					{:else}
						<li class="none">{m.template_no_match()}</li>
					{/each}
				</ul>

				{#if template && template.options.length > 0}
					<div class="options">
						<p class="options-head">{m.export_options()}</p>
						{#each template.options as option (option.key)}
							<label class="field" class:check={option.type === 'boolean'}>
								{#if option.type === 'boolean'}
									<input
										type="checkbox"
										checked={values[option.key] === 'true'}
										onchange={(e) =>
											(values[option.key] = e.currentTarget.checked ? 'true' : 'false')}
									/>
									<span class="label">
										<span class="key">{option.key}</span>
										{#if option.help}<span class="help">{option.help}</span>{/if}
									</span>
								{:else}
									<span class="label">
										<span class="key">{option.key}</span>
										{#if option.help}<span class="help">{option.help}</span>{/if}
									</span>
									<input
										type="text"
										value={values[option.key] ?? ''}
										placeholder={option.type === 'list' ? 'a, b, c' : option.default}
										oninput={(e) => (values[option.key] = e.currentTarget.value)}
									/>
								{/if}
							</label>
						{/each}
					</div>
				{/if}
			</div>

			<footer>
				<button type="button" class="btn" onclick={close}>{m.doc_cancel()}</button>
				<a class="btn primary" {href} target="_blank" rel="noopener" onclick={close}>
					{m.doc_export_pdf()}
				</a>
			</footer>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgb(0 0 0 / 0.45);
	}

	.wrap {
		position: fixed;
		inset: 0;
		z-index: 51;
		display: grid;
		place-items: center;
		padding: 24px;
		pointer-events: none;
	}

	.panel {
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		width: min(520px, 100%);
		max-height: min(640px, 88vh);
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 18px 12px;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}

	.close {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-faint);
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.field-row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 14px;
		border-bottom: 1px solid var(--border);
		color: var(--text-faint);
	}
	.field-row input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font-size: 13.5px;
		outline: none;
	}
	.count {
		flex: none;
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 10px;
	}

	.none {
		padding: 16px 10px;
		text-align: center;
		font-size: 13px;
		color: var(--text-faint);
	}

	.choices {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.choice {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		text-align: start;
		cursor: pointer;
		transition: background-color 120ms ease;
	}
	.choice:hover {
		background: var(--surface-hover);
	}
	.choice.selected {
		background: var(--surface-active);
	}

	.mark {
		flex: none;
		margin-top: 1px;
		font-size: 11px;
		color: var(--brand);
	}

	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.name {
		font-size: 13.5px;
		font-weight: 500;
		color: var(--text);
	}
	.name em {
		margin-inline-start: 6px;
		font-size: 10.5px;
		font-style: normal;
		color: var(--brand);
	}

	.desc {
		margin-top: 2px;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}

	.options {
		margin-top: 10px;
		padding: 12px 10px 4px;
		border-top: 1px solid var(--border);
	}

	.options-head {
		margin: 0 0 10px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.field {
		display: block;
		margin-bottom: 12px;
	}
	.field.check {
		display: flex;
		align-items: flex-start;
		gap: 9px;
	}
	.field.check input {
		margin-top: 2px;
		width: 14px;
		height: 14px;
		accent-color: var(--brand);
	}

	.label {
		display: block;
	}
	.key {
		display: block;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text);
	}
	.help {
		display: block;
		margin-top: 1px;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--text-faint);
	}

	.field input[type='text'] {
		width: 100%;
		height: 32px;
		margin-top: 5px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: 13px;
	}

	footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 14px;
		border-top: 1px solid var(--border);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		height: 32px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 13px;
		cursor: pointer;
	}
	.btn:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.btn.primary {
		background: var(--brand);
		border-color: transparent;
		color: #fff;
		font-weight: 600;
	}
	.btn.primary:hover {
		filter: brightness(1.08);
	}
</style>
