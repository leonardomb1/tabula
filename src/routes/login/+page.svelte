<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { PRODUCT_NAME } from '$lib/branding';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let identifier = $state(untrack(() => form?.identifier) ?? '');
	let submitting = $state(false);
	let showPassword = $state(false);
	let capsLock = $state(false);
	let logoFailed = $state(false);

	const branding = $derived(data.branding);
	const showLogo = $derived(!!branding.logoUrl && !logoFailed);
	const revealLabel = $derived(showPassword ? m.login_hide_password() : m.login_show_password());
	// A form error wins over a flow error: it is the fresher of the two.
	const error = $derived(form?.error ?? data.error);
	const notice = $derived(form?.error ? null : data.notice);

	function trackCapsLock(event: KeyboardEvent) {
		capsLock = event.getModifierState?.('CapsLock') ?? false;
	}
</script>

<svelte:head>
	<title>{m.login_title()} · {PRODUCT_NAME}</title>
</svelte:head>

<main class="page">
	<div class="card">
		<div class="brand">
			{#if showLogo && branding.logoUrl}
				<img
					class="logo"
					src={branding.logoUrl}
					alt={branding.name}
					onerror={() => (logoFailed = true)}
				/>
			{:else}
				<span class="wordmark">{branding.name}</span>
			{/if}
		</div>

		<h1>{m.login_title()}</h1>
		<p class="subtitle">{m.login_subtitle()}</p>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{:else if notice}
			<p class="notice" role="status">{notice}</p>
		{/if}

		{#if data.methods.ldap}
			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<label class="field">
					<span>{m.login_username_label()}</span>
					<input
						name="identifier"
						type="text"
						bind:value={identifier}
						autocomplete="username"
						autocapitalize="none"
						spellcheck="false"
						required
					/>
				</label>

				<label class="field">
					<span>{m.login_password_label()}</span>
					<div class="password">
						<input
							name="password"
							type={showPassword ? 'text' : 'password'}
							autocomplete="current-password"
							onkeyup={trackCapsLock}
							onkeydown={trackCapsLock}
							required
						/>
						<button
							type="button"
							class="reveal"
							aria-pressed={showPassword}
							aria-label={revealLabel}
							title={revealLabel}
							onclick={() => (showPassword = !showPassword)}
						>
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								{#if showPassword}
									<path
										d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
									/>
									<path d="m1 1 22 22" />
								{:else}
									<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
									<circle cx="12" cy="12" r="3" />
								{/if}
							</svg>
						</button>
					</div>
				</label>

				{#if capsLock}
					<p class="hint">{m.login_caps_lock()}</p>
				{/if}

				<button class="submit" type="submit" disabled={submitting}>
					{submitting ? m.login_submitting() : m.login_submit()}
				</button>
			</form>
		{/if}

		{#if data.methods.ldap && data.methods.oidc}
			<div class="divider" role="separator"><span>{m.login_or()}</span></div>
		{/if}

		{#if data.ssoHref}
			<a
				class="sso"
				class:submit={!data.methods.ldap}
				href={data.ssoHref}
				data-sveltekit-reload
			>
				{data.methods.ldap ? m.login_sso() : m.login_submit()}
			</a>
		{/if}

		{#if !data.methods.ldap && !data.methods.oidc}
			<p class="error" role="alert">{m.login_error_no_method()}</p>
		{/if}
	</div>
</main>

<style>
	.page {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}

	.card {
		width: 100%;
		max-width: 25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 2rem;
		box-shadow: var(--shadow);
	}

	.brand {
		display: flex;
		justify-content: center;
		margin-bottom: 1.75rem;
	}
	.logo {
		height: 2.5rem;
		width: auto;
		max-width: 100%;
	}
	.wordmark {
		font-size: 1.25rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.subtitle {
		margin: 0.375rem 0 1.5rem;
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.error {
		margin: 0 0 1.25rem;
		padding: 0.7rem 0.85rem;
		border-radius: 8px;
		background: var(--danger-wash);
		color: var(--danger);
		font-size: 0.875rem;
	}

	/* Signing out is a normal outcome, not a failure — same shape as .error but
	   without the danger colouring. */
	.notice {
		margin: 0 0 1.25rem;
		padding: 0.7rem 0.85rem;
		border-radius: 8px;
		background: var(--surface-muted, var(--surface));
		border: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.field {
		display: block;
		margin-bottom: 1rem;
	}
	.field span {
		display: block;
		margin-bottom: 0.4rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-muted);
	}

	input {
		width: 100%;
		padding: 0.7rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: inherit;
		font: inherit;
		font-size: 0.9375rem;
	}
	input:focus {
		border-color: var(--brand);
	}

	.password {
		position: relative;
	}
	.password input {
		padding-inline-end: 2.9rem;
	}
	.password input::-ms-reveal,
	.password input::-ms-clear {
		display: none;
	}
	.reveal {
		position: absolute;
		inset-inline-end: 0.3rem;
		top: 50%;
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		padding: 0.4rem;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	.reveal:hover {
		color: var(--text);
	}

	.hint {
		margin: -0.4rem 0 0.9rem;
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

	.submit {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.75rem 1rem;
		border: 0;
		border-radius: 8px;
		background: var(--brand);
		color: #fff;
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
	}
	.submit:hover:not(:disabled) {
		filter: brightness(1.07);
	}
	.submit:disabled {
		opacity: 0.65;
		cursor: default;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.25rem 0;
		color: var(--text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--border);
	}

	/* Secondary when it sits under the form; `.submit` styling takes over when
	   SSO is the only way in. */
	.sso:not(.submit) {
		display: block;
		width: 100%;
		padding: 0.7rem 1rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: center;
		text-decoration: none;
	}
	.sso:not(.submit):hover {
		border-color: var(--brand);
		color: var(--brand);
	}
</style>
