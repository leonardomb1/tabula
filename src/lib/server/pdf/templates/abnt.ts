/**
 * ABNT NBR 14724 academic work — aligned with the FATEC Indaiatuba Manual
 * de Normas (rev. 2021/2022), which applies the standard strictly.
 *
 * Typographic baseline:
 *   - A4; margins 3 top / 2 right / 2 bottom / 3 left (cm).
 *   - Body: Times New Roman or Arial 12pt, line-height 1.5, justified,
 *     first-line indent 1.25cm, no paragraph spacing.
 *   - Long quotes (>3 lines): indent 4cm, 10pt, line-height 1.0, no quotes.
 *   - Titles: 14pt bold; subtitles 12pt bold.
 *   - Page numbers: Arabic, top-right, starting at the Introdução but the
 *     counter advances through pre-textual pages too (so the first
 *     numbered page shows its absolute position in the document).
 *
 * Pre-textual order (monografia):
 *
 *   1.  Capa                 — instituição, autor, título, cidade, ano
 *   2.  Folha de rosto       — + natureza, orientador
 *   3.  Errata               — optional (Página/Linha/Onde se lê/Leia-se)
 *   4.  Folha de aprovação   — banca avaliadora (required for final version)
 *   5.  Dedicatória          — optional, bottom-right
 *   6.  Agradecimentos       — optional
 *   7.  Epígrafe             — optional, bottom-right
 *   8.  Resumo               — 150–500 palavras (monografia)
 *   9.  Abstract / Resumen   — same word range, foreign language
 *   10. Lista de ilustrações — optional, ≥5 items
 *   11. Lista de tabelas     — optional
 *   12. Lista de abreviaturas e siglas — optional, ≥5 items
 *   13. Lista de símbolos    — optional
 *   14. Sumário              — obligatory for monografia
 *
 * Textual: Introdução → Desenvolvimento (Fundamentação Teórica, Metodologia,
 * Análise) → Conclusão.
 *
 * Post-textual: Referências (auto-generated if `references:` in frontmatter),
 * Glossário (as author-written section), Apêndice, Anexo.
 *
 *   ```yaml
 *   template: abnt
 *   abnt:
 *     instituicao: Faculdade de Tecnologia de Indaiatuba
 *     curso: Gestão Empresarial
 *     autor: Ana Silva
 *     natureza: |
 *       Trabalho de Graduação apresentado por Ana Silva como pré-requisito
 *       para a conclusão do Curso Superior de Tecnologia em Gestão
 *       Empresarial, da Faculdade de Tecnologia de Indaiatuba, elaborado
 *       sob a orientação do Prof. Dr. João Santos.
 *     orientador: Prof. Dr. João Santos
 *     cidade: Indaiatuba
 *     ano: "2026"
 *     errata:
 *       - pagina: "32"
 *         linha: "5"
 *         ondeSeLe: seguimento
 *         leiaSe: segmento
 *     banca:
 *       - nome: Prof. Dr. João Santos
 *         papel: Orientador
 *       - nome: Profa. Dra. Maria Costa
 *         papel: Avaliadora externa
 *         instituicao: Unicamp
 *     dedicatoria: |
 *       Aos meus pais, pelo apoio incondicional.
 *     agradecimentos: |
 *       Agradeço ao Prof. Dr. João Santos pela orientação dedicada.
 *     epigrafe: |
 *       O único lugar onde o sucesso vem antes do trabalho é no dicionário.
 *     epigrafeAutoria: Albert Einstein
 *     resumo: |
 *       Este trabalho …
 *     palavrasChave: [dados, infraestrutura]
 *     abstract: |
 *       This work …
 *     keywords: [data, infrastructure]
 *     listaIlustracoes:
 *       - rotulo: "Figura 1"
 *         titulo: "Evolução de habitantes"
 *         pagina: "24"
 *     listaTabelas:
 *       - rotulo: "Tabela 1"
 *         titulo: "Distribuição por situação"
 *         pagina: "28"
 *     listaAbreviaturas:
 *       - sigla: ABNT
 *         significado: Associação Brasileira de Normas Técnicas
 *     listaSimbolos:
 *       - simbolo: "Ω"
 *         significado: Ohm (unidade de resistência)
 *   ```
 */

import { INTER_CSS, KATEX_CSS, needsKatex, needsMermaid } from '../shared';
import mermaidScript from 'mermaid/dist/mermaid.min.js?raw';
import type { RenderContext, Template, TocEntry } from '../templates';
import { asString, asStringArray } from '../academic';
import { abntStyle, parseReferences, processCitations, stripReferencesHeading } from '../citations';

interface ErrataEntry {
	pagina: string;
	linha: string;
	ondeSeLe: string;
	leiaSe: string;
}

interface BancaMember {
	nome: string;
	papel?: string;
	instituicao?: string;
}

interface ListaEntry {
	rotulo: string;
	titulo: string;
	pagina?: string;
}

interface AbbrevEntry {
	sigla: string;
	significado: string;
}

interface SimboloEntry {
	simbolo: string;
	significado: string;
}

interface AbntOptions {
	instituicao?: string;
	curso?: string;
	/** Accepts a single author (string) or multiple authors (string[]).
	 *  Multiple authors are rendered one per line on the capa, folha de
	 *  rosto and banca avaliadora, per FATEC manual §4.1.2/§4.1.3. */
	autor?: string | string[];
	natureza?: string;
	orientador?: string;
	cidade?: string;
	ano?: string;

	errata?: ErrataEntry[];
	banca?: BancaMember[];
	dedicatoria?: string;
	agradecimentos?: string;
	epigrafe?: string;
	epigrafeAutoria?: string;

	resumo?: string;
	abstract?: string;
	palavrasChave?: string[];
	keywords?: string[];

	listaIlustracoes?: ListaEntry[];
	listaTabelas?: ListaEntry[];
	listaAbreviaturas?: AbbrevEntry[];
	listaSimbolos?: SimboloEntry[];

	/**
	 * 'times' (default) or 'arial'. NBR 14724 is silent on font choice —
	 * only that the face must be legible and used consistently — the FATEC
	 * manual accepts either.
	 */
	font?: 'times' | 'arial';
}

function asErrataList(v: unknown): ErrataEntry[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: ErrataEntry[] = [];
	for (const item of v) {
		if (!item || typeof item !== 'object') continue;
		const e = item as Record<string, unknown>;
		out.push({
			pagina: asString(e.pagina) ?? '',
			linha: asString(e.linha) ?? '',
			ondeSeLe: asString(e.ondeSeLe) ?? '',
			leiaSe: asString(e.leiaSe) ?? ''
		});
	}
	return out.length ? out : undefined;
}

function asBanca(v: unknown): BancaMember[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: BancaMember[] = [];
	for (const item of v) {
		if (!item || typeof item !== 'object') continue;
		const e = item as Record<string, unknown>;
		const nome = asString(e.nome);
		if (!nome) continue;
		out.push({
			nome,
			papel: asString(e.papel),
			instituicao: asString(e.instituicao)
		});
	}
	return out.length ? out : undefined;
}

function asListaEntries(v: unknown): ListaEntry[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: ListaEntry[] = [];
	for (const item of v) {
		if (!item || typeof item !== 'object') continue;
		const e = item as Record<string, unknown>;
		const rotulo = asString(e.rotulo);
		const titulo = asString(e.titulo);
		if (!rotulo || !titulo) continue;
		out.push({ rotulo, titulo, pagina: asString(e.pagina) });
	}
	return out.length ? out : undefined;
}

function asAbbrevList(v: unknown): AbbrevEntry[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: AbbrevEntry[] = [];
	for (const item of v) {
		if (!item || typeof item !== 'object') continue;
		const e = item as Record<string, unknown>;
		const sigla = asString(e.sigla);
		const significado = asString(e.significado);
		if (!sigla || !significado) continue;
		out.push({ sigla, significado });
	}
	return out.length ? out : undefined;
}

function asSimboloList(v: unknown): SimboloEntry[] | undefined {
	if (!Array.isArray(v)) return undefined;
	const out: SimboloEntry[] = [];
	for (const item of v) {
		if (!item || typeof item !== 'object') continue;
		const e = item as Record<string, unknown>;
		const simbolo = asString(e.simbolo);
		const significado = asString(e.significado);
		if (!simbolo || !significado) continue;
		out.push({ simbolo, significado });
	}
	return out.length ? out : undefined;
}

function asStringOrArray(v: unknown): string | string[] | undefined {
	if (typeof v === 'string') return v;
	if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
	return undefined;
}

function readOptions(raw: Record<string, unknown>): AbntOptions {
	const rawFont = asString(raw.font)?.toLowerCase();
	const font: 'times' | 'arial' | undefined =
		rawFont === 'arial' ? 'arial' : rawFont === 'times' ? 'times' : undefined;
	return {
		instituicao: asString(raw.instituicao),
		curso: asString(raw.curso),
		autor: asStringOrArray(raw.autor),
		natureza: asString(raw.natureza),
		orientador: asString(raw.orientador),
		cidade: asString(raw.cidade),
		ano: asString(raw.ano),
		errata: asErrataList(raw.errata),
		banca: asBanca(raw.banca),
		dedicatoria: asString(raw.dedicatoria),
		agradecimentos: asString(raw.agradecimentos),
		epigrafe: asString(raw.epigrafe),
		epigrafeAutoria: asString(raw.epigrafeAutoria),
		resumo: asString(raw.resumo),
		abstract: asString(raw.abstract),
		palavrasChave: asStringArray(raw.palavrasChave),
		keywords: asStringArray(raw.keywords),
		listaIlustracoes: asListaEntries(raw.listaIlustracoes),
		listaTabelas: asListaEntries(raw.listaTabelas),
		listaAbreviaturas: asAbbrevList(raw.listaAbreviaturas),
		listaSimbolos: asSimboloList(raw.listaSimbolos),
		font
	};
}

function fontFamilyFor(choice: 'times' | 'arial' | undefined): string {
	if (choice === 'arial') return "Arial, 'Liberation Sans', sans-serif";
	return "'Times New Roman', Times, 'Liberation Serif', serif";
}

// CSS is generated per-render so the font-family token follows the
// author's choice.
function buildCss(fontChoice: 'times' | 'arial' | undefined): string {
	const family = fontFamilyFor(fontChoice);
	return `
/* ── Page geometry — FATEC manual / NBR 14724 ── */
@page {
	size: A4;
	margin: 3cm 2cm 2cm 3cm;
	@top-right {
		content: counter(page);
		font-family: ${family};
		font-size: 10pt;
	}
}

/* Pre-textual pages (capa, folha de rosto, dedicatória, etc.) are counted
   but unnumbered per NBR 14724 §5.4. The counter advances so the first
   textual page displays its real absolute position.
   size + margin are re-declared because Chromium does not reliably
   inherit them from the default @page on named pages (same quirk that
   bit the Argos cover — without this the cap-foot floats up ~17 mm). */
@page abnt-pre {
	size: A4;
	margin: 3cm 2cm 2cm 3cm;
	@top-right { content: none; }
}

.abnt-capa,
.abnt-rosto,
.abnt-pre { page: abnt-pre; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
	font-family: ${family};
	font-size: 12pt;
	line-height: 1.5;
	color: #000;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

body { margin: 0; padding: 0; }

/* ══════════════════════════════════════════════════════════════════════
   CAPA — FATEC manual §4.1.2:
     · Nome da Instituição no alto, centralizado, a 3cm da borda superior,
       MAIÚSCULAS, fonte 14, espaçamento duplo.
     · Nome do Autor, centralizado, MAIÚSCULAS, fonte 14.
     · Título centralizado, negrito, minúsculas, fonte 16, no centro da
       página. Subtítulo precedido por dois-pontos.
     · Cidade + ano centralizados, a 2cm da borda inferior, minúsculas,
       fonte 14.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-capa {
	height: calc(297mm - 3cm - 2cm);
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	text-align: center;
	break-after: page;
	font-weight: 700;
}

.abnt-capa .cap-top {
	font-size: 14pt;
	line-height: 2;
	text-transform: uppercase;
}

.abnt-capa .cap-top .cap-autor {
	margin-top: 6em;
}
.abnt-capa .cap-autor > div,
.abnt-rosto .ros-autor > div,
.abnt-banca .ban-autor > div {
	display: block;
}

.abnt-capa .cap-title {
	align-self: center;
	font-size: 16pt;
	font-weight: 700;
	line-height: 1.4;
	max-width: 14cm;
	margin: 0 auto;
	text-wrap: balance;
	/* "letras minúsculas" per manual — sentence/title case as typed,
	   not forced uppercase. */
}

.abnt-capa .cap-foot {
	font-size: 14pt;
	font-weight: 400;
	line-height: 1.4;
}

.abnt-capa .cap-foot .cidade { margin-bottom: 0.2em; }

/* ══════════════════════════════════════════════════════════════════════
   FOLHA DE ROSTO — FATEC manual §4.1.4:
     Repete os dados da capa + explanação sobre natureza do trabalho,
     objetivo acadêmico, instituição e orientador.
     Natureza em texto justificado, fonte 12, a 7cm da margem.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-rosto {
	height: calc(297mm - 3cm - 2cm);
	display: grid;
	grid-template-rows: auto 1fr auto;
	text-align: center;
	break-after: page;
	font-weight: 700;
}

.abnt-rosto .ros-top {
	font-size: 14pt;
	line-height: 1.6;
	text-transform: uppercase;
}

.abnt-rosto .ros-top .ros-curso { margin-top: 0.4em; }
.abnt-rosto .ros-top .ros-autor { margin-top: 5em; }

.abnt-rosto .ros-middle {
	align-self: center;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3em;
	margin: 0 auto;
}

.abnt-rosto .ros-title {
	font-size: 16pt;
	font-weight: 700;
	line-height: 1.4;
	max-width: 14cm;
	text-wrap: balance;
}

/* Natureza: justified block at 7cm from the left margin (manual §4.1.4). */
.abnt-rosto .ros-natureza {
	margin-left: 7cm;
	font-size: 12pt;
	line-height: 1.2;
	text-align: justify;
	font-weight: 400;
	align-self: stretch;
}

.abnt-rosto .ros-natureza .orient {
	margin-top: 0.8em;
}

.abnt-rosto .ros-foot {
	font-size: 14pt;
	font-weight: 400;
	line-height: 1.4;
}

.abnt-rosto .ros-foot .cidade { margin-bottom: 0.2em; }

/* ══════════════════════════════════════════════════════════════════════
   ERRATA — FATEC manual §4.1.5. Acrescida ao trabalho depois da
   impressão. Referência local onde está o erro seguida da correção.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-errata {
	page: abnt-pre;
	break-after: page;
}

.abnt-errata h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-errata table {
	width: 100%;
	border-collapse: collapse;
	font-size: 12pt;
	margin-top: 0.5em;
}

.abnt-errata th {
	text-align: left;
	padding: 2mm 4mm;
	border-bottom: 0.5pt solid #000;
	font-weight: 400;
	font-style: italic;
}

.abnt-errata td {
	padding: 2mm 4mm;
	vertical-align: top;
}

/* ══════════════════════════════════════════════════════════════════════
   FOLHA DE APROVAÇÃO — FATEC manual §4.1.6. Repete capa + banca
   avaliadora (nome, instituição, papel) e data da defesa.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-banca {
	page: abnt-pre;
	break-after: page;
	height: calc(297mm - 3cm - 2cm);
	display: grid;
	grid-template-rows: auto 1fr auto;
	text-align: center;
}

.abnt-banca .ban-top {
	font-size: 14pt;
	font-weight: 700;
	line-height: 1.6;
	text-transform: uppercase;
}

.abnt-banca .ban-top .ban-autor { margin-top: 5em; }

.abnt-banca .ban-title {
	align-self: start;
	margin-top: 3em;
	font-size: 16pt;
	font-weight: 700;
	line-height: 1.4;
	max-width: 14cm;
	margin-left: auto;
	margin-right: auto;
}

.abnt-banca .ban-list {
	align-self: center;
	display: flex;
	flex-direction: column;
	gap: 1.2em;
	text-align: left;
	font-size: 12pt;
	font-weight: 400;
	width: 13cm;
	margin: 0 auto;
}

.abnt-banca .ban-member {
	border-bottom: 0.5pt solid #000;
	padding-bottom: 0.8em;
}

.abnt-banca .ban-name { font-weight: 700; }
.abnt-banca .ban-role { font-style: italic; color: #333; }

.abnt-banca .ban-date {
	align-self: end;
	font-size: 12pt;
	font-weight: 400;
	margin-bottom: 1em;
	text-align: left;
}

/* ══════════════════════════════════════════════════════════════════════
   Dedicatória, Agradecimentos, Epígrafe — FATEC manual §4.1.7–9.
   Dedicatória e epígrafe no canto inferior direito, justificado, a 7cm
   da margem. Agradecimentos com título centralizado.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-dedicatoria,
.abnt-epigrafe {
	page: abnt-pre;
	break-after: page;
	height: calc(297mm - 3cm - 2cm);
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	padding-bottom: 2em;
}

.abnt-dedicatoria .ded-text,
.abnt-epigrafe .epi-text {
	margin-left: 7cm;
	font-size: 12pt;
	line-height: 1.5;
	text-align: justify;
	font-style: italic;
}

.abnt-epigrafe .epi-autor {
	margin-left: 7cm;
	margin-top: 1em;
	text-align: right;
	font-size: 12pt;
	font-style: italic;
}

.abnt-agradecimentos {
	page: abnt-pre;
	break-after: page;
}

.abnt-agradecimentos h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-agradecimentos p {
	text-align: justify;
	text-indent: 1.25cm;
	margin: 0;
}

/* ══════════════════════════════════════════════════════════════════════
   Pre-textual text blocks (resumo, abstract).
   Resumo: parágrafo único, espaçamento simples, palavras-chave ao final.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-pre {
	break-before: page;
	break-after: page;
}

.abnt-pre h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-pre p {
	text-align: justify;
	text-indent: 1.25cm;
	line-height: 1.0;
	margin: 0;
}

.abnt-pre p + p { margin-top: 0.8em; }

.abnt-pre .palavras-chave,
.abnt-pre .keywords {
	margin-top: 1.5em;
	text-indent: 0;
	line-height: 1.0;
}

.abnt-pre .palavras-chave strong,
.abnt-pre .keywords strong { font-weight: 700; }

/* ══════════════════════════════════════════════════════════════════════
   Listas (ilustrações, tabelas, abreviaturas e siglas, símbolos).
   FATEC manual §4.1.12–4.1.13-símbolos. Cada item: rótulo + título +
   página (quando aplicável), alinhado à esquerda.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-lista {
	page: abnt-pre;
	break-after: page;
}

.abnt-lista h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-lista ul {
	list-style: none;
	padding: 0;
	margin: 0;
}

.abnt-lista li {
	display: flex;
	align-items: baseline;
	gap: 4mm;
	padding: 1mm 0;
	font-size: 12pt;
}

.abnt-lista .li-label { font-weight: 400; min-width: 18mm; }
.abnt-lista .li-title { flex: 1; }
.abnt-lista .li-fill {
	flex: 1;
	border-bottom: 1px dotted #000;
	margin: 0 2mm 2mm;
	min-width: 4mm;
}
.abnt-lista .li-pg { min-width: 8mm; text-align: right; }

.abnt-lista.abreviaturas li,
.abnt-lista.simbolos li { gap: 6mm; }

.abnt-lista.abreviaturas .li-sigla,
.abnt-lista.simbolos .li-sigla {
	min-width: 32mm;
	font-weight: 700;
}

/* ══════════════════════════════════════════════════════════════════════
   Sumário — FATEC manual §4.1.14. Elementos pré-textuais não podem
   constar no sumário.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-sumario {
	break-after: page;
	page: abnt-pre;
}

.abnt-sumario h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-sumario ol {
	list-style: none;
	padding: 0;
	margin: 0;
}

.abnt-sumario li {
	display: flex;
	align-items: baseline;
	gap: 4mm;
	padding: 1.5mm 0;
	font-size: 12pt;
}

.abnt-sumario li.toc-level-1 { font-weight: 700; text-transform: uppercase; padding-top: 3mm; }
.abnt-sumario li.toc-level-2 { padding-left: 10mm; }
.abnt-sumario li.toc-level-3 { padding-left: 20mm; font-style: italic; }
.abnt-sumario li.toc-level-4 { padding-left: 30mm; font-style: italic; }

.abnt-sumario .toc-text { flex: 1; }
.abnt-sumario .toc-fill {
	flex: 1;
	border-bottom: 1px dotted #000;
	margin: 0 2mm 2mm;
	min-width: 4mm;
}
.abnt-sumario .toc-pg { min-width: 8mm; text-align: right; }

/* ══════════════════════════════════════════════════════════════════════
   Textual body — NBR 6024 heading tiers + FATEC §1.3–1.4 typography.
   Parágrafos sem afastamento entre si; recuo de primeira linha 1.25 cm;
   texto justificado.
   ═══════════════════════════════════════════════════════════════════ */

.abnt-body h1 {
	font-size: 14pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: left;
	margin: 0 0 1.5em;
	break-before: page;
	break-after: avoid;
}

/* The first h1 already sits at the start of the textual section because
   the container starts a new page — no extra break needed. */
.abnt-body > h1:first-child { break-before: auto; }

.abnt-body h2 {
	font-size: 12pt;
	font-weight: 700;
	text-align: left;
	margin: 2em 0 1em;
	break-after: avoid;
}

.abnt-body h3 {
	font-size: 12pt;
	font-style: italic;
	font-weight: 700;
	text-align: left;
	margin: 1.6em 0 0.8em;
	break-after: avoid;
}

.abnt-body h4 {
	font-size: 12pt;
	font-style: italic;
	font-weight: 400;
	text-align: left;
	margin: 1.3em 0 0.5em;
	break-after: avoid;
}

.abnt-body p {
	text-indent: 1.25cm;
	text-align: justify;
	margin: 0;
	hyphens: auto;
}

.abnt-body h1 + p,
.abnt-body h2 + p,
.abnt-body h3 + p,
.abnt-body h4 + p,
.abnt-body blockquote + p,
.abnt-body pre + p,
.abnt-body table + p,
.abnt-body .table-wrap + p,
.abnt-body figure + p,
.abnt-body ul + p,
.abnt-body ol + p { text-indent: 0; }

/* Table / figure captions and "Fonte:" lines — NBR 14724 §5.8: caption
   above, source below, both centralizados. Markdown emits these as plain
   paragraphs adjacent to the table/figure, so we catch them by position:
   any <p> immediately before or after a <table>/<figure>. Tables are
   wrapped in <div.table-wrap> by the markdown post-processor, so we match
   that too. */
.abnt-body p:has(+ table),
.abnt-body p:has(+ .table-wrap),
.abnt-body table + p,
.abnt-body .table-wrap + p,
.abnt-body p:has(+ figure),
.abnt-body figure + p {
	text-align: center;
	text-indent: 0;
}


.abnt-body ul,
.abnt-body ol {
	margin: 0.5em 0 0.5em 1.25cm;
	padding-left: 1cm;
}

.abnt-body li { margin-bottom: 2mm; }

/* Long direct quotations — NBR 10520: citations >3 lines indent 4cm,
   simple line-spacing, 10pt, no italic, no quotes. */
.abnt-body blockquote {
	margin: 1em 0 1em 4cm;
	font-size: 10pt;
	line-height: 1.0;
	text-align: justify;
}

.abnt-body blockquote p { text-indent: 0; }

/* Inline code — monospace at ~body x-height. */
.abnt-body :not(pre) > code {
	font-family: 'Courier New', Courier, monospace;
	font-size: 11pt;
	background: transparent;
	padding: 0;
	border: 0;
}

.abnt-body pre {
	font-family: 'Courier New', Courier, monospace;
	font-size: 10pt;
	line-height: 1.2;
	background: #f5f3ee;
	border: 0.5pt solid #000;
	padding: 2mm 3mm;
	margin: 1em 0;
	overflow: hidden;
}

/* Tables — NBR 14724: caption on top, source below. Fonte 10pt (FATEC
   §1.3). §3.2: "A tabela deve ser apresentada centralizada." width:100%
   covers the full-width case; margin auto covers narrower tables. */
.abnt-body table {
	width: 100%;
	border-collapse: collapse;
	margin: 1em auto;
	font-size: 10pt;
	break-inside: avoid;
}

.abnt-body table caption {
	caption-side: top;
	font-size: 10pt;
	text-align: left;
	margin-bottom: 2mm;
	font-weight: 400;
}

.abnt-body th {
	border-top: 0.75pt solid #000;
	border-bottom: 0.5pt solid #000;
	text-align: left;
	padding: 1mm 2mm;
	font-weight: 700;
}

.abnt-body td {
	padding: 1mm 2mm;
	border-bottom: 0.25pt solid #000;
	vertical-align: top;
}

.abnt-body tr:last-child td { border-bottom: 0.75pt solid #000; }

/* Figures — caption ABOVE per NBR 14724. Source is free text in markdown. */
.abnt-body figure {
	margin: 1em 0;
	text-align: center;
	break-inside: avoid;
	display: flex;
	flex-direction: column;
}

.abnt-body figure img {
	max-width: 100%;
	height: auto;
	order: 2;
}

.abnt-body figcaption {
	order: 1;
	font-size: 10pt;
	text-align: center;
	margin-bottom: 2mm;
}

.abnt-body a { color: #000; text-decoration: underline; }

/* References — "REFERÊNCIAS" as centered uppercase heading, entries
   left-aligned, single-line, blank line between entries (§1.4). */
.abnt-body h1.references-heading,
.abnt-body h2.references-heading {
	text-transform: uppercase;
	text-align: center;
	margin: 2em 0 1em;
	break-before: page;
}

.abnt-body ol.references-list,
.abnt-body ul.references-list {
	list-style: none;
	padding-left: 0;
	margin-left: 0;
}

.abnt-body ol.references-list li,
.abnt-body ul.references-list li {
	text-indent: 0;
	text-align: left;
	line-height: 1.0;
	margin-bottom: 1em;
	hyphens: none;
}

/* APÊNDICE / ANEXO headings — markdown convention "# APÊNDICE A — Título". */
.abnt-body .apendice-heading {
	text-align: center;
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	margin: 0 0 2em;
	break-before: page;
	break-after: avoid;
}

/* Foreign-language terms — NBR convention. Authors mark with <em>. */
.abnt-body em { font-style: italic; }
`;
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Resolve the author list as a clean string[]. Prefers `abnt.autor` when
 * provided; falls back to the document's root `author` frontmatter.
 * Accepts string or string[] in either place. Manual §4.1.2/§4.1.3:
 * multiple authors render one per line, not comma-separated.
 */
function resolveAutores(opts: AbntOptions, meta: RenderContext['meta']): string[] {
	const src = opts.autor ?? meta.author;
	if (!src) return [];
	if (Array.isArray(src)) return src.map((s) => String(s).trim()).filter(Boolean);
	// Back-compat: older docs stored a single string with commas; split it so
	// each author still gets its own line even without re-saving.
	return String(src).split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
}

function renderAutores(autores: string[]): string {
	return autores.map((a) => `<div>${esc(a)}</div>`).join('');
}

function buildCapa(opts: AbntOptions, meta: RenderContext['meta']): string {
	const instituicao = opts.instituicao ?? '';
	const autores = resolveAutores(opts, meta);
	const cidade = opts.cidade ?? '';
	const ano = opts.ano ?? (meta.date ? new Date(meta.date).getFullYear().toString() : '');

	return `
<section class="abnt-capa">
	<div class="cap-top">
		${instituicao ? `<div class="cap-inst">${esc(instituicao)}</div>` : ''}
		${autores.length ? `<div class="cap-autor">${renderAutores(autores)}</div>` : ''}
	</div>
	<h1 class="cap-title">${esc(meta.title)}</h1>
	<div class="cap-foot">
		${cidade ? `<div class="cidade">${esc(cidade)}</div>` : ''}
		${ano ? `<div class="ano">${esc(ano)}</div>` : ''}
	</div>
</section>`;
}

function buildFolhaDeRosto(opts: AbntOptions, meta: RenderContext['meta']): string {
	const instituicao = opts.instituicao ?? '';
	const curso = opts.curso ?? '';
	const autores = resolveAutores(opts, meta);
	const cidade = opts.cidade ?? '';
	const ano = opts.ano ?? (meta.date ? new Date(meta.date).getFullYear().toString() : '');

	const naturezaBlock = opts.natureza
		? `<div class="ros-natureza">
			${esc(opts.natureza).replace(/\n/g, '<br/>')}
			${opts.orientador ? `<div class="orient">Orientador: ${esc(opts.orientador)}</div>` : ''}
		</div>`
		: opts.orientador
			? `<div class="ros-natureza"><div class="orient">Orientador: ${esc(opts.orientador)}</div></div>`
			: '';

	return `
<section class="abnt-rosto">
	<div class="ros-top">
		${instituicao ? `<div class="ros-inst">${esc(instituicao)}</div>` : ''}
		${curso ? `<div class="ros-curso">${esc(curso)}</div>` : ''}
		${autores.length ? `<div class="ros-autor">${renderAutores(autores)}</div>` : ''}
	</div>
	<div class="ros-middle">
		<h1 class="ros-title">${esc(meta.title)}</h1>
		${naturezaBlock}
	</div>
	<div class="ros-foot">
		${cidade ? `<div class="cidade">${esc(cidade)}</div>` : ''}
		${ano ? `<div class="ano">${esc(ano)}</div>` : ''}
	</div>
</section>`;
}

function buildErrata(opts: AbntOptions): string {
	if (!opts.errata || opts.errata.length === 0) return '';
	const rows = opts.errata
		.map(
			(e) => `
		<tr>
			<td>${esc(e.pagina)}</td>
			<td>${esc(e.linha)}</td>
			<td>${esc(e.ondeSeLe)}</td>
			<td>${esc(e.leiaSe)}</td>
		</tr>`
		)
		.join('');

	return `
<section class="abnt-errata">
	<h1>Errata</h1>
	<table>
		<thead>
			<tr>
				<th>Página</th>
				<th>Linha</th>
				<th>Onde se lê</th>
				<th>Leia-se</th>
			</tr>
		</thead>
		<tbody>${rows}</tbody>
	</table>
</section>`;
}

function buildBanca(opts: AbntOptions, meta: RenderContext['meta']): string {
	if (!opts.banca || opts.banca.length === 0) return '';
	const autores = resolveAutores(opts, meta);

	const members = opts.banca
		.map(
			(m) => `
		<div class="ban-member">
			<div class="ban-name">${esc(m.nome)}</div>
			${m.papel ? `<div class="ban-role">${esc(m.papel)}${m.instituicao ? ' — ' + esc(m.instituicao) : ''}</div>` : m.instituicao ? `<div class="ban-role">${esc(m.instituicao)}</div>` : ''}
		</div>`
		)
		.join('');

	return `
<section class="abnt-banca">
	<div class="ban-top">
		${opts.instituicao ? `<div>${esc(opts.instituicao)}</div>` : ''}
		${autores.length ? `<div class="ban-autor">${renderAutores(autores)}</div>` : ''}
	</div>
	<div class="ban-title">${esc(meta.title)}</div>
	<div class="ban-list">${members}</div>
	<div class="ban-date">Data da defesa: ____ / ____ / ________</div>
</section>`;
}

function buildDedicatoria(opts: AbntOptions): string {
	if (!opts.dedicatoria) return '';
	const paragraphs = opts.dedicatoria
		.split(/\n\n+/)
		.map((p) => `<div class="ded-text">${esc(p).replace(/\n/g, '<br/>')}</div>`)
		.join('');
	return `
<section class="abnt-dedicatoria">${paragraphs}</section>`;
}

function buildAgradecimentos(opts: AbntOptions): string {
	if (!opts.agradecimentos) return '';
	const paragraphs = opts.agradecimentos
		.split(/\n\n+/)
		.map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
		.join('');
	return `
<section class="abnt-agradecimentos">
	<h1>Agradecimentos</h1>
	${paragraphs}
</section>`;
}

function buildEpigrafe(opts: AbntOptions): string {
	if (!opts.epigrafe) return '';
	const body = esc(opts.epigrafe).replace(/\n/g, '<br/>');
	const autoria = opts.epigrafeAutoria ? `<div class="epi-autor">— ${esc(opts.epigrafeAutoria)}</div>` : '';
	return `
<section class="abnt-epigrafe">
	<div class="epi-text">${body}</div>
	${autoria}
</section>`;
}

function buildPreTextual(opts: AbntOptions): string {
	const parts: string[] = [];

	if (opts.resumo) {
		parts.push(`
<section class="abnt-pre">
	<h1>Resumo</h1>
	<p>${esc(opts.resumo).replace(/\n\n+/g, '</p><p>').replace(/\n/g, ' ')}</p>
	${opts.palavrasChave && opts.palavrasChave.length > 0
		? `<p class="palavras-chave"><strong>Palavras-chave:</strong> ${opts.palavrasChave.map(esc).join('. ')}.</p>`
		: ''}
</section>`);
	}

	if (opts.abstract) {
		parts.push(`
<section class="abnt-pre">
	<h1>Abstract</h1>
	<p>${esc(opts.abstract).replace(/\n\n+/g, '</p><p>').replace(/\n/g, ' ')}</p>
	${opts.keywords && opts.keywords.length > 0
		? `<p class="keywords"><strong>Keywords:</strong> ${opts.keywords.map(esc).join('. ')}.</p>`
		: ''}
</section>`);
	}

	return parts.join('\n');
}

// Render a single list entry. When `pagina` is empty we drop the dotted
// fill + page column entirely — otherwise the row ends with a meaningless
// run of dots across the whole line, which is exactly what the user was
// seeing on the rendered Lista de Tabelas.
function renderListaItem(rotulo: string, titulo: string, pagina?: string): string {
	const hasPg = !!(pagina && pagina.trim());
	const pg = hasPg
		? `<span class="li-fill"></span><span class="li-pg">${esc(pagina!)}</span>`
		: '';
	return `
		<li>
			<span class="li-label">${esc(rotulo)}</span>
			<span class="li-title">${esc(titulo)}</span>
			${pg}
		</li>`;
}

function buildListaIlustracoes(opts: AbntOptions): string {
	if (!opts.listaIlustracoes || opts.listaIlustracoes.length === 0) return '';
	const items = opts.listaIlustracoes.map((it) => renderListaItem(it.rotulo, it.titulo, it.pagina)).join('');
	return `
<section class="abnt-lista">
	<h1>Lista de Ilustrações</h1>
	<ul>${items}</ul>
</section>`;
}

function buildListaTabelas(opts: AbntOptions): string {
	if (!opts.listaTabelas || opts.listaTabelas.length === 0) return '';
	const items = opts.listaTabelas.map((it) => renderListaItem(it.rotulo, it.titulo, it.pagina)).join('');
	return `
<section class="abnt-lista">
	<h1>Lista de Tabelas</h1>
	<ul>${items}</ul>
</section>`;
}

function buildListaAbreviaturas(opts: AbntOptions): string {
	if (!opts.listaAbreviaturas || opts.listaAbreviaturas.length === 0) return '';
	const items = opts.listaAbreviaturas
		.map(
			(it) => `
		<li>
			<span class="li-sigla">${esc(it.sigla)}</span>
			<span class="li-title">${esc(it.significado)}</span>
		</li>`
		)
		.join('');
	return `
<section class="abnt-lista abreviaturas">
	<h1>Lista de Abreviaturas e Siglas</h1>
	<ul>${items}</ul>
</section>`;
}

function buildListaSimbolos(opts: AbntOptions): string {
	if (!opts.listaSimbolos || opts.listaSimbolos.length === 0) return '';
	const items = opts.listaSimbolos
		.map(
			(it) => `
		<li>
			<span class="li-sigla">${esc(it.simbolo)}</span>
			<span class="li-title">${esc(it.significado)}</span>
		</li>`
		)
		.join('');
	return `
<section class="abnt-lista simbolos">
	<h1>Lista de Símbolos</h1>
	<ul>${items}</ul>
</section>`;
}

function buildSumario(toc: TocEntry[]): string {
	if (toc.length <= 2) return '';
	// Section numbers live in the heading text itself ("1 Introdução",
	// "1.1 Contexto"), so the sumário only needs to show the text and the
	// page number.
	return `
<section class="abnt-sumario">
	<h1>Sumário</h1>
	<ol>
		${toc
			.map(
				(e) => `<li class="toc-level-${e.level}" data-toc-id="${e.id}">
			<span class="toc-text">${esc(e.text)}</span>
			<span class="toc-fill"></span>
			<span class="toc-pg">—</span>
		</li>`
			)
			.join('\n')}
	</ol>
</section>`;
}

/**
 * Tag headings whose text starts with "APÊNDICE" or "ANEXO" so the CSS
 * can apply the post-textual treatment. Markdown convention: authors
 * write "# APÊNDICE A — Título" or "# ANEXO A - Descrição".
 */
function markApendices(bodyHtml: string): string {
	return bodyHtml.replace(
		/<h([1-3])([^>]*)>(AP[EÊ]NDICE|ANEXO)([^<]*)<\/h[1-3]>/gi,
		'<h$1$2 class="apendice-heading">$3$4</h$1>'
	);
}

async function buildHtml(ctx: RenderContext): Promise<string> {
	const opts = readOptions(ctx.options);
	const capa = buildCapa(opts, ctx.meta);
	const rosto = buildFolhaDeRosto(opts, ctx.meta);
	const errata = buildErrata(opts);
	const banca = buildBanca(opts, ctx.meta);
	const dedicatoria = buildDedicatoria(opts);
	const agradecimentos = buildAgradecimentos(opts);
	const epigrafe = buildEpigrafe(opts);
	const preTextual = buildPreTextual(opts);
	const listaIlu = buildListaIlustracoes(opts);
	const listaTab = buildListaTabelas(opts);
	const listaAbr = buildListaAbreviaturas(opts);
	const listaSim = buildListaSimbolos(opts);
	const sumario = buildSumario(ctx.toc);

	// Citations — if references were declared, scan body for [@key] tokens
	// and emit a formatted references section.
	const references = parseReferences(ctx.options.references);
	const cite = processCitations(ctx.bodyHtml, references, abntStyle);
	const bodyWithCites = cite.hasCitations ? stripReferencesHeading(cite.body) : cite.body;
	const body = markApendices(bodyWithCites);
	const refsSection = cite.hasCitations ? cite.referencesHtml : '';

	const mermaidNeeded = needsMermaid(ctx.bodyHtml);
	const katexNeeded = needsKatex(ctx.bodyHtml);

	const mermaidTags = mermaidNeeded
		? `<script>${mermaidScript}</script>
<script>
  window.__mermaidDone = false;
  document.addEventListener('DOMContentLoaded', async () => {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    await mermaid.run({ querySelector: '.mermaid' });
    window.__mermaidDone = true;
  });
</script>`
		: `<script>window.__mermaidDone = true;</script>`;

	const katexTag = katexNeeded ? `<style>${KATEX_CSS}</style>` : '';

	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${esc(ctx.meta.title)}</title>
<style>${INTER_CSS}</style>
${katexTag}
<style>${buildCss(opts.font)}</style>
${mermaidTags}
</head>
<body>
${capa}
${rosto}
${errata}
${banca}
${dedicatoria}
${agradecimentos}
${epigrafe}
${preTextual}
${listaIlu}
${listaTab}
${listaAbr}
${listaSim}
${sumario}
<div class="abnt-body">
${body}
${refsSection}
</div>
</body>
</html>`;
}

/**
 * Count the pages rendered before the textual body so the sumário's page
 * numbers (patched by index.ts) reflect the true absolute position of
 * each heading.
 */
function abntPreTextualPages(ctx: RenderContext): number {
	const opts = readOptions(ctx.options);
	let count = 2; // capa + folha de rosto
	if (opts.errata && opts.errata.length) count += 1;
	if (opts.banca && opts.banca.length) count += 1;
	if (opts.dedicatoria) count += 1;
	if (opts.agradecimentos) count += 1;
	if (opts.epigrafe) count += 1;
	if (opts.resumo) count += 1;
	if (opts.abstract) count += 1;
	if (opts.listaIlustracoes && opts.listaIlustracoes.length) count += 1;
	if (opts.listaTabelas && opts.listaTabelas.length) count += 1;
	if (opts.listaAbreviaturas && opts.listaAbreviaturas.length) count += 1;
	if (opts.listaSimbolos && opts.listaSimbolos.length) count += 1;
	if (ctx.toc.length > 2) count += 1; // sumário
	return count;
}

export const abnt: Template = {
	id: 'abnt',
	label: 'ABNT — Trabalho Acadêmico',
	buildFull: buildHtml,
	preTextualPages: abntPreTextualPages
};
