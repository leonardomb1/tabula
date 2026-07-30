#import "@preview/cmarker:0.1.6"

// @description Documento corporativo: capa com faixa lateral, sumário, cabeçalho corrido e página de assinaturas.
// @option doctype text "Documento" Tipo mostrado na faixa lateral, na capa e no cabeçalho
// @option version text "" Versão exibida na capa e no cabeçalho
// @option author text "" Responsável na capa; vazio usa o nome completo de quem editou
// @option confidential boolean false Marca a capa e o rodapé como uso interno
// @option approvals list "" Papéis que assinam, em uma página final de aprovações
#let s(k, d) = sys.inputs.at(k, default: d)

#let title = s("title", "Sem título")
#let company = s("company", "")
#let author-override = s("fm.author", "")
#let author = if author-override != "" { author-override } else { s("author", "") }
#let date = s("date", "")
#let tags = s("tags", "")
#let accent = rgb(s("brandColor", "#b4502f"))
#let doctype = upper(s("fm.doctype", "Documento"))
#let version = s("fm.version", "")
#let confidential = lower(s("fm.confidential", "false")) == "true"
#let approvals = s("fm.approvals", "")

#let label-text(body) = text(size: 7.5pt, tracking: 0.18em, fill: luma(120))[#upper(body)]

#set text(size: 10.5pt, lang: "pt", hyphenate: true)
#set par(justify: true, leading: 0.72em)

#set page(
  paper: "a4",
  margin: (left: 2.6cm, right: 2.2cm, top: 2.4cm, bottom: 2.2cm),
  header: context if counter(page).get().first() > 1 {
    set text(size: 8pt, fill: luma(130))
    grid(
      columns: (1fr, auto),
      align(left)[#title],
      align(right)[#doctype #if version != "" [· v#version]],
    )
    v(-0.55em)
    line(length: 100%, stroke: 0.5pt + luma(200))
  },
  footer: context {
    set text(size: 8pt, fill: luma(130))
    line(length: 100%, stroke: 0.5pt + luma(200))
    v(-0.2em)
    grid(
      columns: (1fr, auto, 1fr),
      align(left)[#company],
      align(center)[#if confidential { text(fill: accent, weight: 600)[CONFIDENCIAL] }],
      align(right)[#counter(page).display("1 / 1", both: true)],
    )
  },
)

#page(margin: 0pt, header: none, footer: none)[
  #place(top + left, rect(width: 1.5cm, height: 100%, fill: accent))
  #place(
    bottom + left,
    dx: 1.5cm - 0.42cm,
    dy: -2.2cm,
    rotate(-90deg, origin: bottom + left, reflow: false)[
      #text(size: 7.5pt, tracking: 0.24em, fill: white)[#doctype]
    ],
  )

  #block(inset: (left: 4.2cm, right: 2.4cm, top: 2.6cm, bottom: 2.4cm), height: 100%, width: 100%)[
    #grid(
      columns: (1fr, auto),
      align(left + top)[#label-text(company)],
      align(right + top)[
        #set text(size: 8.5pt, fill: luma(120))
        #if version != "" [Versão #version \ ]
        #date
      ],
    )

    #v(1fr)

    #text(size: 8pt, tracking: 0.22em, fill: accent)[#doctype]
    #v(0.5em)
    #block(width: 88%)[
      #set par(justify: false, leading: 0.42em)
      #text(size: 30pt, weight: 700, hyphenate: false)[#title]
    ]
    #v(0.7em)
    #line(length: 22%, stroke: 2.5pt + accent)

    #v(1fr)

    #grid(
      columns: (1fr, 1fr, 1fr),
      row-gutter: 0.35em,
      label-text("Autor"), label-text("Data"), label-text(if version != "" { "Versão" } else { "Referência" }),
      text(size: 9.5pt)[#author],
      text(size: 9.5pt)[#date],
      text(size: 9.5pt)[#if version != "" [#version] else [#s("slug", "")]],
    )

    #if tags != "" [
      #v(1.1em)
      #label-text("Assuntos")
      #v(0.25em)
      #text(size: 9pt, fill: luma(90))[#tags]
    ]

    #if confidential [
      #v(1.2em)
      #box(inset: (x: 8pt, y: 5pt), stroke: 0.8pt + accent, radius: 2pt)[
        #text(size: 7.5pt, tracking: 0.16em, fill: accent)[USO INTERNO · CONFIDENCIAL]
      ]
    ]
  ]
]

#show heading.where(level: 1): it => block(above: 1.6em, below: 0.8em)[
  #set text(size: 15pt, weight: 700, fill: accent)
  #it.body
]
#show heading.where(level: 2): it => block(above: 1.3em, below: 0.6em)[
  #set text(size: 12.5pt, weight: 600)
  #it.body
]

#show outline.entry.where(level: 1): it => {
  v(0.5em, weak: true)
  strong(it)
}
#outline(title: [Sumário], depth: 3, indent: 1.2em)
#pagebreak()

#show quote: it => block(
  inset: (left: 1em),
  stroke: (left: 3pt + accent),
)[#set text(style: "italic", fill: luma(70)); #it.body]

#show table: it => block(above: 1.2em, below: 1.2em)[#it]
#set table(stroke: 0.5pt + luma(200))

// The image handler resolves attachment images from the document root (cmarker
// otherwise searches inside its own package) and caps them at content width.
#cmarker.render(
  read("/doc.md"),
  raw-typst: true,
  scope: (image: (path, alt: none) => layout(bounds => {
    let img = image(path, alt: alt)
    let size = measure(img)
    if size.width > bounds.width { image(path, alt: alt, width: bounds.width) } else { img }
  }))
)

#if approvals != "" [
  #pagebreak()
  = Aprovações
  #v(1em)
  #grid(
    columns: (1fr, 1fr),
    column-gutter: 1.6cm,
    row-gutter: 2.2cm,
    ..approvals.split(", ").map(role => [
      #line(length: 100%, stroke: 0.6pt + luma(140))
      #v(0.2em)
      #label-text(role)
    ])
  )
]
