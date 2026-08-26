/**
 * A deliberately small, good-enough Markdown -> HTML converter. It only
 * needs to handle what Gemini actually produces (headings, bold, italic,
 * bullet/numbered lists, paragraphs) so a "Save as note" result opens
 * looking right in the rich text editor - it's not a general parser.
 */
export function markdownToHtml(markdown) {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let listType = null; // 'ul' | 'ol' | null

  function closeList() {
    if (listType) {
      html.push(listType === 'ul' ? '</ul>' : '</ol>');
      listType = null;
    }
  }

  function inline(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = line.match(/^\d+\.\s+(.*)/);
    if (numbered) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return html.join('\n');
}
