<script lang="ts">
	/**
	 * A person's name, with their card on hover or focus. Rendered into the popover top
	 * layer because the reading pane scrolls and its view-transition-name makes it a
	 * containing block for fixed descendants.
	 */
	import * as m from '$lib/paraglide/messages';
	import Crown from './Crown.svelte';
	import { label, roleLabel } from '$lib/labels';
	import { initialsOf, type Person } from '$lib/people';

	let { person }: { person: Person } = $props();

	let trigger = $state<HTMLButtonElement | null>(null);
	let card = $state<HTMLDivElement | null>(null);
	let openTimer: ReturnType<typeof setTimeout> | undefined;
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	let isOpen = $state(false);

	const initials = $derived(initialsOf(person.name));

	const standing = $derived(
		person.crown === 'gold'
			? m.role_platform_admin()
			: person.role
				? label(roleLabel, person.role)
				: person.known
					? m.person_no_access()
					: m.person_never_signed_in()
	);

	const GAP = 8;

	function place() {
		if (!trigger || !card) return;
		const t = trigger.getBoundingClientRect();
		const c = card.getBoundingClientRect();

		const below = t.bottom + GAP;
		const above = t.top - c.height - GAP;
		const top = below + c.height <= window.innerHeight - 8 || above < 8 ? below : above;

		const left = Math.min(Math.max(8, t.left), Math.max(8, window.innerWidth - c.width - 8));

		card.style.top = `${Math.round(top)}px`;
		card.style.left = `${Math.round(left)}px`;
	}

	function open() {
		clearTimeout(closeTimer);
		if (isOpen) return;
		openTimer = setTimeout(() => {
			if (!card) return;
			card.showPopover();
			isOpen = true;
			place();
		}, 130);
	}

	function close() {
		clearTimeout(openTimer);
		closeTimer = setTimeout(() => {
			if (!isOpen || !card) return;
			card.hidePopover();
			isOpen = false;
		}, 160);
	}

	function closeNow() {
		clearTimeout(openTimer);
		clearTimeout(closeTimer);
		if (isOpen && card) {
			card.hidePopover();
			isOpen = false;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') closeNow();
	}}
	onscroll={closeNow}
/>

<button
	bind:this={trigger}
	type="button"
	class="person"
	aria-expanded={isOpen}
	onmouseenter={open}
	onmouseleave={close}
	onfocus={open}
	onblur={close}
	onclick={() => (isOpen ? closeNow() : open())}
>
	{person.name}
</button>

<div
	bind:this={card}
	popover="manual"
	class="card"
	role="tooltip"
	onmouseenter={() => clearTimeout(closeTimer)}
	onmouseleave={close}
>
	<div class="head">
		<span class="crest">
			<span class="avatar">{initials}</span>
			{#if person.crown}
				<Crown variant={person.crown} size={18} />
			{/if}
		</span>
		<span class="who">
			<span class="name">{person.name}</span>
			{#if person.title}<span class="title">{person.title}</span>{/if}
		</span>
	</div>

	<div class="facts">
		<span class="role" class:none={!person.role}>{standing}</span>
		{#if person.mail}
			<a class="mail" href="mailto:{person.mail}">
				<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
					<path d="m3 7 9 6 9-6" />
				</svg>
				{person.mail}
			</a>
		{/if}
		<span class="login">{person.username}</span>
	</div>
</div>

<style>
	.person {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		border-bottom: 1px dashed transparent;
		transition: color 120ms ease, border-color 120ms ease;
	}
	.person:hover,
	.person[aria-expanded='true'] {
		color: var(--text);
		border-bottom-color: var(--border-strong);
	}
	.person:focus-visible {
		outline: 2px solid var(--brand);
		outline-offset: 1px;
		border-radius: 3px;
	}

	.card {
		position: fixed;
		inset: auto;
		margin: 0;
		width: max-content;
		max-width: min(300px, calc(100vw - 16px));
		padding: 12px 13px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
		opacity: 0;
		translate: 0 -4px;
		scale: 0.98;
		transform-origin: top left;
		transition:
			opacity 130ms ease,
			translate 130ms cubic-bezier(0.2, 0.8, 0.3, 1),
			scale 130ms cubic-bezier(0.2, 0.8, 0.3, 1),
			display 130ms allow-discrete,
			overlay 130ms allow-discrete;
	}
	.card:popover-open {
		opacity: 1;
		translate: none;
		scale: 1;
	}
	@starting-style {
		.card:popover-open {
			opacity: 0;
			translate: 0 -4px;
			scale: 0.98;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition-duration: 0s;
		}
	}

	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.crest {
		position: relative;
		flex: none;
		display: block;
	}
	.crest :global(.crown) {
		position: absolute;
		top: -10px;
		left: 50%;
		transform: translateX(-50%);
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 12.5px;
		font-weight: 600;
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.name {
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.25;
	}

	.title {
		font-size: 11.5px;
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.facts {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		margin-top: 11px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}

	.role {
		padding: 1px 7px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		font-size: 11px;
		color: var(--text-muted);
	}
	.role.none {
		color: var(--text-faint);
		font-style: italic;
		border-style: dashed;
	}

	.mail {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		font-size: 12px;
		color: var(--text-muted);
		text-decoration: none;
		overflow: hidden;
	}
	.mail:hover {
		color: var(--brand);
	}
	.mail svg {
		flex: none;
		color: var(--text-faint);
	}

	.login {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-faint);
	}
</style>
