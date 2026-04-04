import { Highlight } from './types';

const escapeMd = (s: string) => s.replace(/([#>*_`\-\[\]\\|~])/g, '\\$1');

export function exportHighlightsAsMarkdown(highlights: Highlight[]): void {
  if (highlights.length === 0) return;

  const groups = new Map<string, Highlight[]>();
  for (const h of highlights) {
    const list = groups.get(h.url) || [];
    list.push(h);
    groups.set(h.url, list);
  }

  const sortedGroups = [...groups.entries()]
    .map(([url, items]) => ({
      url,
      highlights: [...items].sort((a, b) => a.timestamp - b.timestamp),
    }))
    .sort((a, b) => a.highlights[0].timestamp - b.highlights[0].timestamp);

  let md = `# Highlights Export\n\n`;
  md += `*Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*\n\n---\n\n`;

  for (let gi = 0; gi < sortedGroups.length; gi++) {
    const group = sortedGroups[gi];
    const pageTitle = group.highlights[0].pageTitle || group.url;
    md += `## ${escapeMd(pageTitle)}\n\n`;
    md += `[Source](${group.url})\n\n`;

    for (let hi = 0; hi < group.highlights.length; hi++) {
      const h = group.highlights[hi];
      const date = new Date(h.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      md += `### ${hi + 1}. ${date}\n\n`;
      md += escapeMd(h.text).split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';

      if (h.notes.length > 0) {
        md += `**Notes**\n`;
        for (const note of h.notes) {
          md += `- ${escapeMd(note.text)}\n`;
        }
        md += `\n`;
      }
    }

    if (gi < sortedGroups.length - 1) {
      md += `---\n\n`;
    }
  }

  const blob = new Blob([md], { type: 'text/markdown' });
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = `highlights-${new Date().toISOString().slice(0, 10)}.md`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(objUrl);
    a.remove();
  }, 100);
}
