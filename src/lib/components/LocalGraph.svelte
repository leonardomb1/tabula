<script lang="ts">
	import { onMount } from 'svelte';

	interface Node {
		id: string;
		slug: string;
		title: string;
	}
	interface Edge {
		source: string;
		target: string;
	}

	let {
		nodes,
		edges,
		selected = null,
		onselect,
		width = 640,
		height = 280
	}: {
		nodes: Node[];
		edges: Edge[];
		selected?: string | null;
		onselect?: (node: Node) => void;
		width?: number;
		height?: number;
	} = $props();

	const PAD = 36;

	let pos = $state<Record<string, { x: number; y: number }>>({});
	let hovered = $state<string | null>(null);

	const dense = $derived(nodes.length > 40);
	const degree = $derived.by(() => {
		const d = new Map<string, number>();
		for (const e of edges) {
			d.set(e.source, (d.get(e.source) ?? 0) + 1);
			d.set(e.target, (d.get(e.target) ?? 0) + 1);
		}
		return d;
	});

	// Small force relaxation, run once: repulsion between all nodes, springs on
	// edges, mild gravity to the middle. Deterministic seed (golden-angle
	// spiral), so the same graph always settles into the same picture.
	onMount(() => {
		const W = width;
		const H = height;
		const p = new Map<string, { x: number; y: number; vx: number; vy: number }>();
		const spread = Math.min(W, H) / 2 - PAD;
		nodes.forEach((n, i) => {
			const a = i * 2.399963;
			const r = spread * Math.sqrt((i + 0.5) / nodes.length);
			p.set(n.id, { x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a), vx: 0, vy: 0 });
		});

		const spring = dense ? 70 : 100;
		const repel = dense ? 1400 : 2600;
		const ticks = nodes.length > 80 ? 130 : 220;
		for (let t = 0; t < ticks; t++) {
			for (let i = 0; i < nodes.length; i++) {
				for (let j = i + 1; j < nodes.length; j++) {
					const a = p.get(nodes[i].id)!;
					const b = p.get(nodes[j].id)!;
					let dx = a.x - b.x;
					let dy = a.y - b.y;
					const d2 = Math.max(64, dx * dx + dy * dy);
					const f = repel / d2;
					const d = Math.sqrt(d2);
					dx /= d;
					dy /= d;
					a.vx += dx * f;
					a.vy += dy * f;
					b.vx -= dx * f;
					b.vy -= dy * f;
				}
			}
			for (const e of edges) {
				const a = p.get(e.source);
				const b = p.get(e.target);
				if (!a || !b) continue;
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const d = Math.max(1, Math.hypot(dx, dy));
				const f = (d - spring) * 0.015;
				a.vx += (dx / d) * f;
				a.vy += (dy / d) * f;
				b.vx -= (dx / d) * f;
				b.vy -= (dy / d) * f;
			}
			for (const n of nodes) {
				const q = p.get(n.id)!;
				q.vx += (W / 2 - q.x) * 0.004;
				q.vy += (H / 2 - q.y) * 0.004;
				q.x = Math.min(W - PAD, Math.max(PAD, q.x + q.vx));
				q.y = Math.min(H - PAD + 8, Math.max(PAD - 10, q.y + q.vy));
				q.vx *= 0.82;
				q.vy *= 0.82;
			}
		}

		pos = Object.fromEntries([...p.entries()].map(([id, q]) => [id, { x: q.x, y: q.y }]));
	});

	const touches = (e: Edge, id: string | null) => id !== null && (e.source === id || e.target === id);
	const emphasized = (id: string) => hovered === id || selected === id;

	function radius(id: string): number {
		const base = dense ? 3.5 : 5.5;
		return Math.min(base + (degree.get(id) ?? 0) * 0.6, base + 4.5);
	}

	function label(title: string): string {
		return title.length > 22 ? `${title.slice(0, 21)}…` : title;
	}
</script>

<svg viewBox="0 0 {width} {height}" role="img">
	{#each edges as e (e.source + e.target)}
		{#if pos[e.source] && pos[e.target]}
			<line
				x1={pos[e.source].x}
				y1={pos[e.source].y}
				x2={pos[e.target].x}
				y2={pos[e.target].y}
				class="edge"
				class:hot={touches(e, hovered) || touches(e, selected)}
			/>
		{/if}
	{/each}
	{#each nodes as n (n.id)}
		{#if pos[n.id]}
			<g
				role="button"
				tabindex="0"
				aria-label={n.title}
				onpointerenter={() => (hovered = n.id)}
				onpointerleave={() => (hovered = null)}
				onclick={() => onselect?.(n)}
				onkeydown={(e) => e.key === 'Enter' && onselect?.(n)}
			>
				<circle
					cx={pos[n.id].x}
					cy={pos[n.id].y}
					r={radius(n.id)}
					class="node"
					class:sel={selected === n.id}
					class:hot={hovered === n.id}
				/>
				{#if !dense || emphasized(n.id)}
					<text x={pos[n.id].x} y={pos[n.id].y + radius(n.id) + 12} class="tag" class:sel={selected === n.id}>
						{label(n.title)}
					</text>
				{/if}
			</g>
		{/if}
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-rail);
	}

	.edge {
		stroke: var(--border-strong);
		stroke-width: 1;
	}
	.edge.hot {
		stroke: var(--brand);
		stroke-width: 1.5;
	}

	.node {
		fill: var(--text-faint);
		stroke: var(--bg-rail);
		stroke-width: 1.5;
	}
	.node.sel {
		fill: var(--brand);
	}
	.node.hot:not(.sel) {
		fill: var(--text);
	}
	g {
		cursor: pointer;
		outline: none;
	}
	g:focus-visible .node {
		stroke: var(--brand);
		stroke-width: 2;
	}

	.tag {
		fill: var(--text-faint);
		font-size: 10px;
		text-anchor: middle;
		font-family: var(--font-ui);
		pointer-events: none;
	}
	.tag.sel {
		fill: var(--text-muted);
		font-weight: 600;
	}
	g:hover .tag {
		fill: var(--text);
	}
</style>
