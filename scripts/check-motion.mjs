/* -------------------------------------------------------------------------
   cards.css may not animate position or size.

   `.card` belongs to CSS3DRenderer, which writes a matrix3d onto it every
   frame; a stylesheet transition on the same properties fights that loop and
   the cards stutter. AGENTS.md states the rule so that checking it is a grep
   rather than a judgement call, and this is that grep.

   Only cards.css is read, on purpose. styles.css transitions `transform` in
   two places deliberately — the link handle's reveal and the colour swatches —
   so pointing this at the board's stylesheet reports correct code as broken.
   The wider "nothing that moves is animated" rule stays a review judgement.
   ------------------------------------------------------------------------- */

import { readFileSync } from 'node:fs'

const FILES = ['src/cards/cards.css']

/* `all` is not in AGENTS.md's list but is the way around it — it covers
   transform and the four box properties in one word. */
const BANNED = new Set(['transform', 'width', 'height', 'top', 'left', 'all'])

/* Comments are replaced by their own newlines rather than dropped, so the
   offsets below still point at the right source line. The header of cards.css
   discusses these property names and would otherwise report itself. */
const stripComments = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))

/* Both halves of the value can wrap, so the match runs to the end of the
   declaration rather than the end of the line. */
const DECLARATION = /transition(-property)?\s*:[^;{}]*/g
const TOKEN = /[A-Za-z][A-Za-z0-9-]*/g

function violations(file) {
  const source = stripComments(readFileSync(file, 'utf8'))
  const found = []

  for (const match of source.matchAll(DECLARATION)) {
    const named = [...match[0].matchAll(TOKEN)]
      .map((t) => t[0])
      .filter((t) => BANNED.has(t))

    if (named.length === 0) continue

    found.push({
      file,
      line: source.slice(0, match.index).split('\n').length,
      properties: [...new Set(named)],
      text: match[0].replace(/\s+/g, ' ').trim(),
    })
  }

  return found
}

const found = FILES.flatMap(violations)

if (found.length === 0) {
  console.log(`check:motion — ${FILES.join(', ')} animates nothing that moves`)
  process.exit(0)
}

for (const v of found) {
  console.error(`${v.file}:${v.line}  transitions ${v.properties.join(', ')}`)
  console.error(`  ${v.text}\n`)
}
console.error(
  `${found.length} violation(s). A card's position is written by ` +
    'useCardScene.ts, not by a transition — see docs/cards.md.',
)
process.exit(1)
