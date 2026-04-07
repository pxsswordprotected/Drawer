import { Highlight } from './types';

export interface ExportOptions {
  includeNotes: boolean;
  includeTimestamps: boolean;
  includePageTitles: boolean;
}

const escapeMd = (s: string) => s.replace(/([#>*_`\-\[\]\\|~])/g, '\\$1');

export function generateMarkdown(highlights: Highlight[], options: ExportOptions): string {
  if (highlights.length === 0) return '';

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

  let md = '';

  for (let gi = 0; gi < sortedGroups.length; gi++) {
    const group = sortedGroups[gi];

    if (options.includePageTitles) {
      const pageTitle = group.highlights[0].pageTitle || group.url;
      md += `## ${escapeMd(pageTitle)}\n\n`;
      md += `[Source](${group.url})\n\n`;
    }

    for (let hi = 0; hi < group.highlights.length; hi++) {
      const h = group.highlights[hi];
      if (options.includeTimestamps) {
        const date = new Date(h.timestamp).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        md += `### ${date}\n\n`;
      }

      md += escapeMd(h.text).split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';

      if (options.includeNotes && h.notes.length > 0) {
        for (const note of h.notes) {
          md += `- ${escapeMd(note.text)}\n`;
        }
        md += `\n`;
      }
    }

    if (options.includePageTitles && gi < sortedGroups.length - 1) {
      md += `---\n\n`;
    }
  }

  return md;
}

export function downloadMarkdown(md: string): void {
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

export function downloadJson(json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = `highlights-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(objUrl);
    a.remove();
  }, 100);
}

export function copyMarkdown(md: string): Promise<void> {
  return navigator.clipboard.writeText(md);
}
