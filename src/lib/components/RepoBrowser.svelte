<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { docHref } from '$lib/nav';

	interface RepoFile {
		slug: string;
		path: string;
	}

	let { workspaceId, name, files }: { workspaceId: string; name: string; files: RepoFile[] } =
		$props();

	let filter = $state('');

	interface DirNode {
		dirs: Map<string, DirNode>;
		files: RepoFile[];
	}

	const tree = $derived.by(() => {
		const root: DirNode = { dirs: new Map(), files: [] };
		for (const f of files) {
			const parts = f.path.split('/');
			let node = root;
			for (const part of parts.slice(0, -1)) {
				let child = node.dirs.get(part);
				if (!child) {
					child = { dirs: new Map(), files: [] };
					node.dirs.set(part, child);
				}
				node = child;
			}
			node.files.push(f);
		}
		return root;
	});

	const matches = $derived(
		filter.trim()
			? files.filter((f) => f.path.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 200)
			: null
	);

	let open = $state(new Set<string>());
	function toggle(prefix: string) {
		const next = new Set(open);
		if (next.has(prefix)) next.delete(prefix);
		else next.add(prefix);
		open = next;
	}

	const sortedDirs = (node: DirNode) => [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	const sortedFiles = (node: DirNode) =>
		[...node.files].sort((a, b) => a.path.localeCompare(b.path));
	const basename = (p: string) => p.split('/').pop() ?? p;
</script>

{#snippet fileRow(f: RepoFile, label: string, indent: number)}
	<a class="row file" style:padding-inline-start="{indent}px" href={docHref(workspaceId, f.slug)}>
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
			<path d="M14 3v5h5" />
		</svg>
		<span class="fname">{label}</span>
	</a>
{/snippet}

{#snippet dir(node: DirNode, prefix: string, depth: number)}
	{#each sortedDirs(node) as [dname, child] (dname)}
		{@const key = `${prefix}${dname}/`}
		<button type="button" class="row dir" style:padding-inline-start="{10 + depth * 16}px" onclick={() => toggle(key)}>
			<svg class="chev" class:open={open.has(key)} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="m9 6 6 6-6 6" />
			</svg>
			<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
			</svg>
			<span class="fname">{dname}</span>
		</button>
		{#if open.has(key)}
			{@render dir(child, key, depth + 1)}
			{#each sortedFiles(child) as f (f.slug)}
				{@render fileRow(f, basename(f.path), 10 + (depth + 1) * 16 + 18)}
			{/each}
		{/if}
	{/each}
{/snippet}

<div class="browser">
	<header>
		<h1>
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="6" cy="6" r="2.6" />
				<circle cx="6" cy="18" r="2.6" />
				<circle cx="18" cy="8" r="2.6" />
				<path d="M6 8.6v6.8M18 10.6c0 3.4-3 4.4-6 4.4H9" />
			</svg>
			{name}
		</h1>
		<span class="count">{files.length} {m.repo_files().toLowerCase()}</span>
	</header>

	<input
		class="filter"
		type="text"
		bind:value={filter}
		placeholder={m.repo_filter_files()}
		autocomplete="off"
		spellcheck="false"
	/>

	<div class="list" class:mono={true}>
		{#if matches}
			{#if matches.length === 0}
				<p class="none">{m.repo_no_match()}</p>
			{/if}
			{#each matches as f (f.slug)}
				{@render fileRow(f, f.path, 12)}
			{/each}
		{:else}
			{@render dir(tree, '', 0)}
			{#each sortedFiles(tree) as f (f.slug)}
				{@render fileRow(f, f.path, 12)}
			{/each}
		{/if}
	</div>
</div>

<style>
	.browser {
		max-width: 860px;
		margin: 0 auto;
		padding: 40px 32px 80px;
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
		letter-spacing: -0.015em;
	}
	.count {
		font-size: 12.5px;
		color: var(--text-faint);
	}

	.filter {
		width: 100%;
		height: 34px;
		margin-bottom: 12px;
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 13px;
	}
	.filter:focus {
		outline: none;
		border-color: var(--border-strong);
	}

	.list {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
		font-family: var(--font-mono);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 5px 12px;
		border: 0;
		border-bottom: 1px solid var(--border);
		background: none;
		color: var(--text-muted);
		font-size: 12.5px;
		font-family: inherit;
		text-align: start;
		cursor: pointer;
	}
	.row:last-child {
		border-bottom: 0;
	}
	.row:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.row svg {
		flex: none;
		color: var(--text-faint);
	}
	.dir .fname {
		font-weight: 600;
	}
	.chev {
		transition: transform 120ms ease;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.fname {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.none {
		margin: 0;
		padding: 14px 12px;
		font-size: 12.5px;
		color: var(--text-faint);
	}
</style>
