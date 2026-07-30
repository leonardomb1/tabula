<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
	import { PRODUCT_NAME } from '$lib/branding';
	import { dur } from '$lib/motion';
	import {
		getReadingFont,
		getTheme,
		setReadingFont,
		setTheme,
		type ReadingFont,
		type Theme
	} from '$lib/preferences';

	let {
		open = $bindable(false),
		canWrite = false,
		username = '',
		directoryName = '',
		onDone
	}: {
		open?: boolean;
		canWrite?: boolean;
		username?: string;
		directoryName?: string;
		onDone: () => void;
	} = $props();

	const TOTAL = 4;
	let step = $state(0);
	let theme = $state<Theme>('auto');
	let font = $state<ReadingFont>('serif');
	let modKey = $state('Ctrl');
	let fullName = $state('');
	let displayName = $state('');
	let saving = $state(false);

	onMount(() => {
		theme = getTheme();
		font = getReadingFont();
		if (/mac/i.test(navigator.platform)) modKey = '⌘';
	});

	async function finish(skip = false) {
		if (saving) return;
		saving = true;
		try {
			await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(
					skip ? { onboarded: true } : { fullName, displayName, onboarded: true }
				)
			});
		} catch {
		}
		saving = false;
		open = false;
		step = 0;
		onDone();
	}

	const themes: { value: Theme; label: () => string; path: string }[] = [
		{ value: 'auto', label: m.theme_auto, path: 'M3 5h18v11H3zM8 20h8M12 16v4' },
		{
			value: 'light',
			label: m.theme_light,
			path: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'
		},
		{ value: 'dark', label: m.theme_dark, path: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z' }
	];

	const fonts: { value: ReadingFont; label: () => string; family: string }[] = [
		{ value: 'serif', label: m.font_serif, family: 'var(--font-serif-read)' },
		{ value: 'sans', label: m.font_sans, family: 'var(--font-ui)' },
		{ value: 'mono', label: m.font_mono, family: 'var(--font-mono)' }
	];
</script>

{#if open}
	<div class="scrim" transition:fade={{ duration: dur(200) }}></div>

	<div class="wrap">
		{#key step}
			<div
				class="card"
				role="dialog"
				aria-modal="true"
				aria-label={m.onboarding_step({ current: step + 1, total: TOTAL })}
				in:fly={{ x: 24, duration: dur(240) }}
			>
				{#if step === 0}
					<span class="mark">{[...PRODUCT_NAME][0]}</span>
					<h1>{m.onboarding_welcome_title({ brand: PRODUCT_NAME })}</h1>
					<p class="body">{m.onboarding_welcome_body()}</p>

					<div class="seg center">
						{#each locales as locale (locale)}
							<button
								type="button"
								class:selected={getLocale() === locale}
								onclick={() => getLocale() !== locale && setLocale(locale)}
							>
								{locale === 'pt-br' ? 'Português' : 'English'}
							</button>
						{/each}
					</div>

					<button type="button" class="primary" onclick={() => (step = 1)}>
						{m.onboarding_start()}
					</button>
					<button type="button" class="quiet" onclick={() => finish(true)} disabled={saving}>
						{m.onboarding_skip()}
					</button>
				{:else if step === 1}
					<span class="badge">
						<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="8" r="4" />
							<path d="M5 21a7 7 0 0 1 14 0" />
						</svg>
					</span>
					<h2>{m.onboarding_profile_title()}</h2>
					<p class="body">{m.onboarding_profile_body()}</p>

					<label class="field" for="ob-fullname">{m.settings_full_name()}</label>
					<input
						id="ob-fullname"
						type="text"
						bind:value={fullName}
						maxlength="80"
						placeholder={directoryName || username}
						autocomplete="name"
					/>

					<label class="field" for="ob-displayname">{m.settings_call_you()}</label>
					<input
						id="ob-displayname"
						type="text"
						bind:value={displayName}
						maxlength="80"
						placeholder={fullName.split(' ')[0] || directoryName.split(' ')[0] || username}
						autocomplete="nickname"
					/>

					<button type="button" class="primary" onclick={() => (step = 2)}>
						{m.onboarding_next()}
					</button>
				{:else if step === 2}
					<span class="badge">
						<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M4 20h16M7 16l5-12 5 12M9 12h6" />
						</svg>
					</span>
					<h2>{m.onboarding_appearance_title()}</h2>
					<p class="body">{m.onboarding_appearance_body()}</p>

					<p class="label">{m.theme_label()}</p>
					<div class="seg">
						{#each themes as option (option.value)}
							<button
								type="button"
								class:selected={theme === option.value}
								onclick={() => {
									theme = option.value;
									setTheme(option.value);
								}}
							>
								<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d={option.path} />
								</svg>
								{option.label()}
							</button>
						{/each}
					</div>

					<p class="label">{m.font_label()}</p>
					<div class="seg">
						{#each fonts as option (option.value)}
							<button
								type="button"
								class:selected={font === option.value}
								style:font-family={option.family}
								onclick={() => {
									font = option.value;
									setReadingFont(option.value);
								}}
							>
								{option.label()}
							</button>
						{/each}
					</div>

					<button type="button" class="primary" onclick={() => (step = 3)}>
						{m.onboarding_next()}
					</button>
				{:else}
					<span class="badge">
						<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M12 3v18M3 8h18M3 16h18" />
						</svg>
					</span>
					<h2>{m.onboarding_tour_title()}</h2>

					<ul class="tips">
						<li>
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
								<circle cx="11" cy="11" r="7" />
								<path d="m20 20-3.5-3.5" />
							</svg>
							<span>{m.onboarding_tip_search({ key: `${modKey}K` })}</span>
						</li>
						<li>
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M4 7h16M4 12h10M4 17h6" />
							</svg>
							<span>{m.onboarding_tip_tags()}</span>
						</li>
						{#if canWrite}
							<li>
								<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
								</svg>
								<span>{m.onboarding_tip_new()}</span>
							</li>
						{/if}
					</ul>

					<button type="button" class="primary" onclick={() => finish()} disabled={saving}>{m.onboarding_finish()}</button>
					<button type="button" class="quiet" onclick={() => (step = 2)}>{m.onboarding_back()}</button>
				{/if}

				<div class="dots" aria-hidden="true">
					{#each Array(TOTAL) as _, i (i)}
						<span class:on={i === step}></span>
					{/each}
				</div>
			</div>
		{/key}
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: color-mix(in oklab, var(--bg) 92%, transparent);
		backdrop-filter: blur(3px);
	}

	.wrap {
		position: fixed;
		inset: 0;
		z-index: 61;
		display: grid;
		place-items: center;
		padding: 20px;
		pointer-events: none;
	}

	.card {
		pointer-events: auto;
		width: min(420px, 100%);
		padding: 28px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--surface);
		box-shadow: var(--shadow);
		text-align: center;
	}

	.mark {
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		margin: 0 auto 14px;
		border-radius: 14px;
		background: var(--brand);
		color: #fff;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 700;
	}

	.badge {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		margin-bottom: 14px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--brand) 14%, transparent);
		color: var(--brand);
	}

	h1,
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 600;
		letter-spacing: -0.015em;
		font-variation-settings: 'opsz' 42;
	}
	h1 {
		font-size: 22px;
	}
	h2 {
		font-size: 19px;
		text-align: start;
	}

	.body {
		margin: 8px 0 0;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--text-muted);
	}
	h2 ~ .body {
		text-align: start;
	}

	.label {
		margin: 18px 0 6px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-faint);
		text-align: start;
	}

	.field {
		display: block;
		margin: 16px 0 5px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		text-align: start;
	}

	input {
		width: 100%;
		height: 36px;
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--bg);
		font-size: 13.5px;
	}

	.seg {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: var(--radius-sm);
		background: var(--bg-rail);
	}
	.seg.center {
		margin-top: 16px;
	}
	.seg button {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		padding: 7px 8px;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--text-muted);
		font-size: 12.5px;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.seg button:hover {
		color: var(--text);
	}
	.seg button.selected {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}

	.tips {
		margin: 16px 0 0;
		padding: 0;
		list-style: none;
		text-align: start;
	}
	.tips li {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 9px 0;
		border-bottom: 1px solid var(--border);
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.tips li:last-child {
		border-bottom: 0;
	}
	.tips svg {
		flex: none;
		margin-top: 2px;
		color: var(--brand);
	}

	.primary {
		width: 100%;
		margin-top: 22px;
		padding: 10px 16px;
		border: 0;
		border-radius: 10px;
		background: var(--brand);
		color: #fff;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition: filter 120ms ease;
	}
	.primary:hover {
		filter: brightness(1.08);
	}

	.quiet {
		width: 100%;
		margin-top: 8px;
		padding: 6px;
		border: 0;
		background: none;
		color: var(--text-faint);
		font-size: 12px;
		cursor: pointer;
		transition: color 120ms ease;
	}
	.quiet:hover {
		color: var(--text-muted);
	}

	.dots {
		display: flex;
		justify-content: center;
		gap: 6px;
		margin-top: 22px;
	}
	.dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--border-strong);
		transition: background-color 150ms ease;
	}
	.dots span.on {
		background: var(--brand);
	}
</style>
