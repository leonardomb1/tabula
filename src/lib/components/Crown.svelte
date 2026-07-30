<script lang="ts">
	/**
	 * Rank crown: gold for platform admins, silver for maintainers. Vector rather than
	 * pixel art so it stays sharp at any size.
	 */
	let {
		variant,
		size = 14,
		label
	}: { variant: 'gold' | 'silver'; size?: number; label?: string } = $props();

	const uid = $props.id();
	const body = `crown-body-${uid}`;
	const band = `crown-band-${uid}`;

	const metal = $derived(
		{
			gold: { light: '#FFE08A', mid: '#EFB63C', dark: '#B87914', bandLight: '#E5A62C', bandDark: '#95610F' },
			silver: { light: '#F4F7F9', mid: '#CBD4DA', dark: '#8D979E', bandLight: '#BFC8CE', bandDark: '#6F7A81' }
		}[variant]
	);
</script>

<svg
	class="crown"
	viewBox="0 0 24 18"
	width={size}
	height={(size * 18) / 24}
	role={label ? 'img' : 'presentation'}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<defs>
		<linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color={metal.light} />
			<stop offset="0.55" stop-color={metal.mid} />
			<stop offset="1" stop-color={metal.dark} />
		</linearGradient>
		<linearGradient id={band} x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color={metal.bandLight} />
			<stop offset="1" stop-color={metal.bandDark} />
		</linearGradient>
	</defs>

	<path
		d="M1.9 12 L2.9 3.4 L7.3 8.2 L12 1.6 L16.7 8.2 L21.1 3.4 L22.1 12 Z"
		fill="url(#{body})"
	/>
	<path d="M1.9 12 L2.9 3.4 L7.3 8.2 L12 1.6 L12 12 Z" fill={metal.light} opacity="0.26" />

	<rect x="1.5" y="11.2" width="21" height="5.6" rx="1.2" fill="url(#{band})" />
	<circle cx="7" cy="14" r="1.15" fill={metal.dark} opacity="0.7" />
	<circle cx="12" cy="14" r="1.35" fill={metal.dark} opacity="0.8" />
	<circle cx="17" cy="14" r="1.15" fill={metal.dark} opacity="0.7" />
</svg>

<style>
	.crown {
		display: block;
		flex: none;
		filter: drop-shadow(0 0.5px 0.5px rgb(0 0 0 / 0.35));
	}
</style>
