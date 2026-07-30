<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as m from '$lib/paraglide/messages';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
	import { dur } from '$lib/motion';
	import Crown from './Crown.svelte';
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
		user,
		profile = { fullName: '', displayName: '' },
		onProfileSaved
	}: {
		open?: boolean;
		user: {
			username: string;
			displayName?: string;
			isPlatformAdmin: boolean;
			jobTitle?: string;
			crown?: 'gold' | 'silver' | null;
		};
		profile?: { fullName: string; displayName: string };
		onProfileSaved?: () => void;
	} = $props();

	let fullName = $state(untrack(() => profile.fullName));
	let displayName = $state(untrack(() => profile.displayName));
	let savedAt = $state(0);
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ fullName, displayName })
			});
			savedAt = Date.now();
			onProfileSaved?.();
		}, 500);
	}

	type Section = 'general' | 'account' | 'tokens';
	let section = $state<Section>('general');

	interface TokenRow {
		id: string;
		label: string;
		createdAt: string;
		lastUsedAt: string | null;
		expiresAt: string | null;
		revokedAt: string | null;
	}
	let tokens = $state<TokenRow[]>([]);
	let tokensLoaded = $state(false);
	let newLabel = $state('');
	let minting = $state(false);
	let freshToken = $state<string | null>(null);
	let copied = $state(false);

	async function loadTokens() {
		const res = await fetch('/api/tokens');
		if (!res.ok) return;
		const body = (await res.json()) as { tokens: TokenRow[] };
		tokens = body.tokens.filter((t) => !t.revokedAt);
		tokensLoaded = true;
	}

	$effect(() => {
		if (open && section === 'tokens' && !tokensLoaded) void loadTokens();
	});

	async function mint() {
		if (minting) return;
		minting = true;
		copied = false;
		const res = await fetch('/api/tokens', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ label: newLabel.trim() || 'token' })
		});
		minting = false;
		if (!res.ok) return;
		const body = (await res.json()) as { token: string };
		freshToken = body.token;
		newLabel = '';
		await loadTokens();
	}

	async function copyToken() {
		if (!freshToken) return;
		await navigator.clipboard.writeText(freshToken).catch(() => {});
		copied = true;
	}

	async function revoke(id: string) {
		await fetch(`/api/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' });
		await loadTokens();
	}
	let theme = $state<Theme>('auto');
	let font = $state<ReadingFont>('serif');
	let panel = $state<HTMLDivElement | null>(null);

	onMount(() => {
		theme = getTheme();
		font = getReadingFont();
	});

	$effect(() => {
		if (open) panel?.focus();
	});

	const name = $derived(user.displayName || user.username);

	function close() {
		open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}

	async function signOut() {
		await fetch('/auth/logout', { method: 'POST' });
		location.href = '/login';
	}

	const themes: { value: Theme; label: () => string; path: string }[] = [
		{
			value: 'auto',
			label: m.theme_auto,
			path: 'M3 5h18v11H3zM8 20h8M12 16v4'
		},
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

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="scrim" transition:fade={{ duration: dur(140) }} onclick={close}></div>

	<div class="wrap">
		<div
			bind:this={panel}
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-label={m.settings()}
			tabindex="-1"
			transition:scale={{ duration: dur(170), start: 0.97, easing: cubicOut }}
		>
			<nav class="nav" aria-label={m.settings_section()}>
				<p class="nav-head">{m.settings()}</p>
				<button
					type="button"
					class="nav-item"
					class:selected={section === 'general'}
					onclick={() => (section = 'general')}
				>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="3" />
						<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" transform="scale(0.86) translate(2 2)" />
					</svg>
					{m.settings_general()}
				</button>
				<button
					type="button"
					class="nav-item"
					class:selected={section === 'account'}
					onclick={() => (section = 'account')}
				>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="8" r="4" />
						<path d="M5 21a7 7 0 0 1 14 0" />
					</svg>
					{m.settings_account()}
				</button>
				<button
					type="button"
					class="nav-item"
					class:selected={section === 'tokens'}
					onclick={() => (section = 'tokens')}
				>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="7.5" cy="15.5" r="4.5" />
						<path d="M10.7 12.3 21 2m-4 4 3 3" />
					</svg>
					{m.settings_tokens()}
				</button>
			</nav>

			<div class="content">
				<button type="button" class="close" aria-label={m.settings_close()} onclick={close}>
					<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>

				{#if section === 'general'}
					<h2>{m.settings_appearance()}</h2>

					<div class="row">
						<span class="row-label">{m.theme_label()}</span>
						<div class="icons">
							{#each themes as option (option.value)}
								<button
									type="button"
									class="icon-btn"
									class:selected={theme === option.value}
									aria-label={option.label()}
									title={option.label()}
									aria-pressed={theme === option.value}
									onclick={() => {
										theme = option.value;
										setTheme(option.value);
									}}
								>
									<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d={option.path} />
									</svg>
								</button>
							{/each}
						</div>
					</div>

					<div class="row">
						<span class="row-label">{m.font_label()}</span>
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
					</div>

					<div class="row">
						<span class="row-label">{m.language_label()}</span>
						<div class="seg">
							{#each locales as locale (locale)}
								<button
									type="button"
									class:selected={getLocale() === locale}
									onclick={() => setLocale(locale)}
								>
									{locale.toUpperCase()}
								</button>
							{/each}
						</div>
					</div>
				{:else if section === 'account'}
					<h2>{m.settings_account()}</h2>

					<div class="identity">
						<span class="crest">
							<span class="avatar">
								{name
									.split(/[\s,]+/)
									.filter(Boolean)
									.slice(0, 2)
									.map((p) => p[0]?.toUpperCase() ?? '')
									.join('')}
							</span>
							{#if user.crown}
								<Crown
									variant={user.crown}
									size={26}
									label={user.crown === 'gold' ? m.role_platform_admin() : m.role_maintainer()}
								/>
							{/if}
						</span>
						<div>
							<p class="who">{name}</p>
							<p class="sub">
								{#if user.jobTitle}
									<span class="job">{user.jobTitle}</span>
									<span class="dot">·</span>
								{/if}
								{user.username}
							</p>
						</div>
					</div>

					<p class="section-head">{m.settings_profile()}</p>
					<div class="row">
						<span class="row-label">{m.settings_full_name()}</span>
						<input
							class="text-input"
							type="text"
							maxlength="80"
							bind:value={fullName}
							placeholder={user.username}
							oninput={scheduleSave}
						/>
					</div>
					<div class="row">
						<span class="row-label">
							{m.settings_call_you()}
							<span class="row-hint">{m.settings_call_you_hint()}</span>
						</span>
						<input
							class="text-input"
							type="text"
							maxlength="80"
							bind:value={displayName}
							placeholder={fullName.split(' ')[0] || user.username}
							oninput={scheduleSave}
						/>
					</div>

					<button type="button" class="signout" onclick={signOut}>{m.signout()}</button>
				{:else if section === 'tokens'}
					<h2>{m.settings_tokens()}</h2>
					<p class="hint-text">{m.tokens_hint()}</p>

					<div class="mint">
						<input
							class="text-input"
							type="text"
							maxlength="64"
							bind:value={newLabel}
							placeholder={m.tokens_label_placeholder()}
							onkeydown={(e) => e.key === 'Enter' && mint()}
						/>
						<button type="button" class="mint-btn" disabled={minting} onclick={mint}>
							{m.tokens_create()}
						</button>
					</div>

					{#if freshToken}
						<div class="fresh">
							<code class="fresh-token">{freshToken}</code>
							<button type="button" class="copy" onclick={copyToken}>
								{copied ? m.tokens_copied() : m.tokens_copy()}
							</button>
							<p class="fresh-note">{m.tokens_created_note()}</p>
						</div>
					{/if}

					{#if tokensLoaded && tokens.length === 0}
						<p class="none">{m.tokens_empty()}</p>
					{:else}
						<ul class="token-list">
							{#each tokens as t (t.id)}
								<li>
									<span class="tok-main">
										<span class="tok-label">{t.label}</span>
										<span class="tok-meta">
											{new Date(t.createdAt).toLocaleDateString()}
											· {t.lastUsedAt
												? `${m.tokens_last_used()} ${new Date(t.lastUsedAt).toLocaleDateString()}`
												: m.tokens_never_used()}
											{#if t.expiresAt}
												· {m.tokens_expires()} {new Date(t.expiresAt).toLocaleDateString()}
											{/if}
										</span>
									</span>
									<button type="button" class="revoke" onclick={() => revoke(t.id)}>
										{m.tokens_revoke()}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
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
		display: grid;
		grid-template-columns: 208px 1fr;
		width: min(860px, 100%);
		height: min(560px, 88vh);
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
		outline: none;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 10px;
		background: var(--bg-rail);
		border-inline-end: 1px solid var(--border);
	}

	.nav-head {
		margin: 0 0 8px;
		padding-inline: 8px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 9px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		font-size: 13px;
		text-align: start;
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.nav-item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.nav-item.selected {
		background: var(--surface-active);
		color: var(--text);
		font-weight: 500;
	}

	.content {
		position: relative;
		padding: 22px 26px;
		overflow-y: auto;
	}

	.close {
		position: absolute;
		top: 14px;
		inset-inline-end: 16px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
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

	h2 {
		margin: 0 0 4px;
		font-size: 15px;
		font-weight: 600;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 0;
		border-bottom: 1px solid var(--border);
	}
	.row:last-of-type {
		border-bottom: 0;
	}

	.row-label {
		font-size: 13px;
		color: var(--text-muted);
	}

	.hint-text {
		margin: 0 0 14px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-muted);
		max-width: 56ch;
	}

	.mint {
		display: flex;
		gap: 8px;
		margin-bottom: 14px;
	}
	.mint .text-input {
		flex: 1;
	}
	.mint-btn {
		flex: none;
		height: 32px;
		padding: 0 13px;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--brand);
		color: #fff;
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.mint-btn:disabled {
		opacity: 0.6;
	}

	.fresh {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 14px;
		padding: 10px 12px;
		border: 1px solid var(--brand);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.fresh-token {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 12px;
		white-space: nowrap;
	}
	.copy {
		flex: none;
		height: 26px;
		padding: 0 11px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.fresh-note {
		flex-basis: 100%;
		margin: 0;
		font-size: 11.5px;
		color: var(--text-faint);
	}

	.none {
		font-size: 12.5px;
		color: var(--text-faint);
		font-style: italic;
	}

	.token-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.token-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 2px;
		border-bottom: 1px solid var(--border);
	}
	.tok-main {
		display: flex;
		flex-direction: column;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}
	.tok-label {
		font-size: 13.5px;
		font-weight: 500;
	}
	.tok-meta {
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.revoke {
		flex: none;
		height: 26px;
		padding: 0 11px;
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.section-head {
		margin: 18px 0 0;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.row-hint {
		display: block;
		font-size: 11px;
		color: var(--text-faint);
	}

	.text-input {
		width: min(220px, 55%);
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: 13px;
	}

	.icons {
		display: flex;
		gap: 2px;
		padding: 2px;
		border-radius: var(--radius-sm);
		background: var(--bg-rail);
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 30px;
		height: 26px;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--text-faint);
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.icon-btn:hover {
		color: var(--text);
	}
	.icon-btn.selected {
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}

	.seg {
		display: flex;
		gap: 2px;
		padding: 2px;
		border-radius: var(--radius-sm);
		background: var(--bg-rail);
	}
	.seg button {
		padding: 5px 12px;
		border: 0;
		border-radius: 5px;
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

	.identity {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 0 4px;
	}
	.crest {
		position: relative;
		flex: none;
		display: block;
	}
	.crest :global(.crown) {
		position: absolute;
		top: -13px;
		left: 50%;
		transform: translateX(-50%);
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 14px;
		font-weight: 600;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.sub {
		margin: 1px 0 0;
		font-size: 12.5px;
		color: var(--text-faint);
	}

	.job {
		color: var(--text-muted);
	}
	.dot {
		opacity: 0.5;
	}

	.signout {
		margin-top: 22px;
		padding: 7px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text-muted);
		font-size: 13px;
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
	}
	.signout:hover {
		border-color: var(--danger);
		color: var(--danger);
	}

	@media (max-width: 720px) {
		.panel {
			grid-template-columns: 1fr;
			height: min(640px, 90vh);
		}
		.nav {
			flex-direction: row;
			overflow-x: auto;
			border-inline-end: 0;
			border-bottom: 1px solid var(--border);
		}
		.nav-head {
			display: none;
		}
	}
</style>
