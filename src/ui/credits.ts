/** Turns `CREDITS.md` into plain lines for the credits screen. */

export interface CreditLine {
  kind: 'heading' | 'text' | 'item' | 'row';
  text: string;
}

/** Markdown inline markup to plain text: links keep their text, emphasis and code marks go. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTableSeparator(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Headings (below the document title), paragraphs, bullets and table rows as
 * plain lines. Table header rows are dropped; a row's cells are joined with
 * " · ". Paragraph lines that wrap are joined into one.
 */
export function parseCredits(markdown: string): CreditLine[] {
  const lines: CreditLine[] = [];
  let paragraph = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const wasParagraph = paragraph;
    paragraph = false;
    if (line === '') continue;
    const heading = /^(#+)\s+(.*)$/.exec(line);
    if (heading) {
      // The screen has its own title.
      if ((heading[1] ?? '').length > 1)
        lines.push({ kind: 'heading', text: plainText(heading[2] ?? '') });
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      lines.push({ kind: 'item', text: plainText(bullet[1] ?? '') });
      continue;
    }
    if (line.startsWith('|')) {
      const cells = line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
      if (isTableSeparator(cells)) {
        if (lines.at(-1)?.kind === 'row') lines.pop();
        continue;
      }
      lines.push({ kind: 'row', text: cells.map(plainText).filter(Boolean).join(' · ') });
      continue;
    }
    const last = lines.at(-1);
    if (wasParagraph && last) last.text = `${last.text} ${plainText(line)}`;
    else lines.push({ kind: 'text', text: plainText(line) });
    paragraph = true;
  }
  return lines;
}
