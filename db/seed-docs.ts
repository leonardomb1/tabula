#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Stress-test seed — generates N markdown documents into a workspace's
 * content directory so the list UI can be exercised against realistic
 * volume (pagination, tag filtering, sort, search).
 *
 * Run from inside the docs container so the files land on the bind-mounted
 * path the app is already reading from, with the container's own UID:
 *
 *   docker exec tabula-docs-1 bun db/seed-docs.ts default 1000
 *
 * Args:
 *   1) wsId    — workspace id, e.g. "default" or "personal-admin". Required.
 *   2) count   — number of docs to generate. Defaults to 1000.
 *
 * Each doc carries realistic frontmatter (title, author, date, tags, plus
 * occasional `public`, `formal`, `template`, `description`) and a lorem-
 * style body that varies in length. The tag and author pools are small so
 * filtering actually shows grouping; titles vary in length to exercise
 * truncation.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// ─── CLI args ────────────────────────────────────────────────────────────

const wsId = process.argv[2];
const count = Number(process.argv[3] ?? 1000);

if (!wsId) {
	console.error('Usage: bun db/seed-docs.ts <wsId> [count]');
	process.exit(1);
}
if (!Number.isFinite(count) || count < 1) {
	console.error(`Invalid count: ${process.argv[3]}`);
	process.exit(1);
}

// ─── Pools ───────────────────────────────────────────────────────────────

const TAGS = [
	'arquitetura', 'infraestrutura', 'dados', 'api', 'segurança',
	'frontend', 'backend', 'devops', 'ml', 'documentação',
	'onboarding', 'runbook', 'postmortem', 'rfc', 'decisão'
];

const AUTHORS = [
	'Leonardo Machado Baptista',
	'Ricardo Luciano Ferreira',
	'Ana Paula Oliveira',
	'Marcos Vinícius Souza',
	'Camila Rodrigues',
	'Gustavo Henrique Lima',
	'Brazil IT',
	'Equipe de Dados'
];

const TITLE_OPENERS = [
	'Análise', 'Proposta', 'Estudo', 'Relatório', 'Guia', 'Especificação',
	'Documento', 'Avaliação', 'Revisão', 'Mapeamento', 'Plano',
	'Visão geral', 'Procedimento', 'Arquitetura', 'Protocolo'
];
const TITLE_SUBJECTS = [
	'de ingestão de dados', 'do pipeline de ML', 'da malha de microsserviços',
	'dos controles de acesso', 'da estratégia de cache', 'do fluxo de deploy',
	'da camada de observabilidade', 'do mecanismo de autenticação',
	'dos contratos de API internos', 'do modelo de dados analíticos',
	'da política de retenção de logs', 'da topologia de rede produtiva',
	'da migração para Kubernetes', 'da estrutura de permissões',
	'da integração com sistemas legados', 'do gateway de API',
	'da estratégia de backups', 'do monitoramento sintético'
];

const SENTENCES = [
	'O presente documento apresenta os principais elementos conceituais envolvidos no tema, estabelecendo as bases para as seções subsequentes.',
	'Foram considerados múltiplos cenários de operação, com ênfase nas condições típicas de produção.',
	'A análise dos dados disponíveis evidencia padrões consistentes com as hipóteses iniciais propostas.',
	'As métricas coletadas ao longo do período indicam variações significativas entre os ambientes observados.',
	'Entre as limitações identificadas, destacam-se restrições de escopo e a dependência de sistemas externos.',
	'Recomenda-se que as próximas iterações incluam validações adicionais junto aos times de infraestrutura.',
	'A implementação proposta segue os princípios arquiteturais adotados nos demais componentes da plataforma.',
	'Os resultados preliminares sugerem ganhos mensuráveis em tempo de resposta e consumo de recursos.',
	'Detalhes adicionais sobre a configuração encontram-se no apêndice técnico ao final deste documento.',
	'A integração com o módulo de autenticação existente não requer alterações no schema atual.'
];

const DOCTYPES = [
	'Documento formal', 'RFC interno', 'Technical Environment Overview',
	'Guia operacional', 'Relatório de assessment', 'Ata de reunião técnica'
];

const TEMPLATES = ['abnt', 'argos', 'acm', 'ieee'];

// ─── Helpers ─────────────────────────────────────────────────────────────

// Linear congruential generator seeded on wsId+date so two runs on the
// same day produce different data but repeat within a day for easier
// debugging.
let seed = hash(wsId + new Date().toISOString().slice(0, 10));
function rand(): number {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 0x100000000;
}
function hash(s: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}
function pick<T>(arr: readonly T[]): T {
	return arr[Math.floor(rand() * arr.length)];
}
function pickN<T>(arr: readonly T[], n: number): T[] {
	const copy = [...arr];
	const out: T[] = [];
	for (let i = 0; i < n && copy.length > 0; i++) {
		const idx = Math.floor(rand() * copy.length);
		out.push(copy.splice(idx, 1)[0]);
	}
	return out;
}

// Same alphabet the server's `newDocId` uses so seeded slugs are
// indistinguishable from real ones.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function mintId(length = 10): string {
	let out = '';
	for (let i = 0; i < length; i++) {
		out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
	}
	return out;
}

function randomDate(): string {
	// Spread across the last 2 years.
	const now = Date.now();
	const twoYears = 1000 * 60 * 60 * 24 * 730;
	const t = now - Math.floor(rand() * twoYears);
	return new Date(t).toISOString().slice(0, 10);
}

function makeTitle(): string {
	// Occasionally produce very long titles so truncation logic in the
	// list UI gets exercised.
	const longTail = rand() < 0.15 ? ` — ${pick(TITLE_SUBJECTS)}` : '';
	return `${pick(TITLE_OPENERS)} ${pick(TITLE_SUBJECTS)}${longTail}`;
}

function makeBody(title: string): string {
	const paragraphs = 1 + Math.floor(rand() * 5);
	const chunks: string[] = [`# ${title}`, ''];
	for (let i = 0; i < paragraphs; i++) {
		const nSentences = 2 + Math.floor(rand() * 3);
		const sentences = pickN(SENTENCES, nSentences).join(' ');
		chunks.push(sentences);
		chunks.push('');
		// Occasional subheadings / lists for variety.
		if (rand() < 0.3) {
			chunks.push('## Pontos principais', '');
			const items = 2 + Math.floor(rand() * 3);
			for (let j = 0; j < items; j++) {
				chunks.push(`- ${pick(SENTENCES).split('.')[0]}.`);
			}
			chunks.push('');
		}
	}
	return chunks.join('\n');
}

function makeFrontmatter(): Record<string, unknown> {
	const fm: Record<string, unknown> = {
		author:
			rand() < 0.25
				? pickN(AUTHORS, 2 + Math.floor(rand() * 2)) // multi-author
				: pick(AUTHORS),
		date: randomDate(),
		tags: pickN(TAGS, 1 + Math.floor(rand() * 4))
	};
	if (rand() < 0.35) fm.description = pick(SENTENCES);
	if (rand() < 0.15) fm.public = true;
	if (rand() < 0.2) {
		fm.formal = true;
		fm.doctype = pick(DOCTYPES);
		fm.template = pick(TEMPLATES);
		fm.version = `Rev. ${String(Math.floor(rand() * 9) + 1).padStart(2, '0')}`;
	}
	return fm;
}

function stringifyFrontmatter(fm: Record<string, unknown>): string {
	// Tiny YAML writer — we only produce strings, booleans, and arrays of
	// strings, so a 10-line handler beats pulling in js-yaml here.
	const lines: string[] = ['---'];
	for (const [k, v] of Object.entries(fm)) {
		if (Array.isArray(v)) {
			lines.push(`${k}:`);
			for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
		} else {
			lines.push(`${k}: ${yamlScalar(v)}`);
		}
	}
	lines.push('---');
	return lines.join('\n');
}

function yamlScalar(v: unknown): string {
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	if (typeof v === 'string') {
		// Quote if the value could be mis-parsed (e.g. starts with a quote,
		// colon, or looks numeric/boolean). Basic heuristic — enough for
		// our generated content.
		if (/^[\s"'[\]{}|&*#?:@,-]/.test(v) || /:\s/.test(v)) {
			return JSON.stringify(v);
		}
		return v;
	}
	return String(v);
}

// ─── Main ────────────────────────────────────────────────────────────────

const dir = join('content', 'workspaces', wsId);
await mkdir(dir, { recursive: true });

const start = Date.now();
const slugs = new Set<string>();
let written = 0;
let skipped = 0;

for (let i = 0; i < count; i++) {
	let slug = mintId();
	// 1% chance of collision at 10 chars over 62^10 space is astronomical,
	// but within a single run we track minted ids to be strictly unique.
	let attempts = 0;
	while (slugs.has(slug) && attempts < 8) {
		slug = mintId();
		attempts++;
	}
	if (slugs.has(slug)) {
		skipped++;
		continue;
	}
	slugs.add(slug);

	const title = makeTitle();
	const fm = makeFrontmatter();
	const body = makeBody(title);
	const content = `${stringifyFrontmatter(fm)}\n\n${body}`;

	const path = join(dir, `${slug}.md`);
	await Bun.write(path, content);
	written++;

	if (written % 100 === 0) {
		const pct = Math.round((written / count) * 100);
		console.log(`${written}/${count} (${pct}%)`);
	}
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\nDone. ${written} docs written to ${dir} in ${elapsed}s${skipped ? ` (${skipped} skipped due to collisions)` : ''}`);
console.log('Restart the docs container (or wait for the next list() call) so the in-memory doc cache picks them up.');
