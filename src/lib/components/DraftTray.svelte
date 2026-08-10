<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { docHref } from '$lib/nav';
	import { relativeTime } from '$lib/time';

	/**
	 * Drafts an agent left in the user's personal workspace. The point of showing
	 * them is that expiry should never be a surprise: every row says when it goes,
	 * and keeping one is a single click.
	 */
	let {
		workspaceId,
		drafts
	}: {
		workspaceId: string;
		drafts: {
			id: string;
			slug: string;
			title: string;
			mode: 'markdown' | 'typst';
			origin: string | null;
			chars: number;
			updatedAt: Date | string;
			expiresAt: Date | string;
		}[];
	} = $props();

	const locale = $derived(getLocale());
	const DAY = 24 * 60 * 60 * 1000;

	function expiringSoon(at: Date | string): boolean {
		return new Date(at).getTime() - Date.now() < DAY;
	}

	function sizeLabel(chars: number): string {
		return chars < 1000 ? `${chars} ch` : `${Math.round(chars / 1000)}k ch`;
	}
</script>

{#if drafts.length > 0}
	<section class="tray" aria-labelledby="drafts-heading">
		<header>
			<h2 id="drafts-heading">{m.drafts_title()}</h2>
			<span class="count">{drafts.length}</span>
			<p class="hint">{m.drafts_hint()}</p>
		</header>

		<ul>
			{#each drafts as draft (draft.id)}
				<li>
					<a class="row" href={docHref(workspaceId, draft.slug)}>
						<span class="mode" class:typst={draft.mode === 'typst'} aria-hidden="true"></span>
						<span class="title">{draft.title || m.doc_untitled()}</span>
						{#if draft.origin}
							<span class="chip">{draft.origin}</span>
						{/if}
						<span class="size">{sizeLabel(draft.chars)}</span>
						<time
							class="expiry"
							class:soon={expiringSoon(draft.expiresAt)}
							datetime={new Date(draft.expiresAt).toISOString()}
						>
							{m.drafts_expires({ when: relativeTime(draft.expiresAt, locale) })}
						</time>
					</a>

					<div class="actions">
						<form method="POST" action="?/keep" use:enhance>
							<input type="hidden" name="id" value={draft.id} />
							<button type="submit" class="keep">{m.drafts_keep()}</button>
						</form>
						<form method="POST" action="?/discard" use:enhance>
							<input type="hidden" name="id" value={draft.id} />
							<button type="submit" class="discard" title={m.drafts_discard()}>
								<svg
									viewBox="0 0 24 24"
									width="13"
									height="13"
									fill="none"
									stroke="currentColor"
									stroke-width="2.2"
									stroke-linecap="round"
									aria-hidden="true"
								>
									<path d="M6 6l12 12M18 6L6 18" />
								</svg>
								<span class="sr">{m.drafts_discard()}</span>
							</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.tray {
		margin-top: 30px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.005em;
		color: var(--text);
	}

	.count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--surface-active);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
	}

	.hint {
		flex: 1 1 100%;
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--text-faint);
	}

	ul {
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.row {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		margin-inline: -10px;
		border-radius: var(--radius-sm);
	}
	.row:hover {
		background: var(--surface);
	}

	.mode {
		width: 5px;
		height: 5px;
		border-radius: 999px;
		background: var(--text-faint);
		flex-shrink: 0;
	}
	.mode.typst {
		background: var(--brand);
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13.5px;
		color: var(--text);
	}

	.chip {
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 11px;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.size,
	.expiry {
		font-size: 11.5px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.expiry.soon {
		color: var(--danger, #c0392b);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	button {
		font-family: inherit;
		cursor: pointer;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
	}

	.keep {
		height: 24px;
		padding: 0 9px;
		font-size: 11.5px;
		font-weight: 600;
	}
	.keep:hover {
		background: var(--surface-active);
		color: var(--text);
	}

	.discard {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
	}
	.discard:hover {
		color: var(--text);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
