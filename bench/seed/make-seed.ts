// Generates a backup file with 30 sites of highlights and notes for hand-testing the drawer.
// Run: bun bench/seed/make-seed.ts
// Then in the extension: drawer > Settings > Restore backup > pick bench/seed/seed-30-sites.json
// Deterministic (seeded PRNG, fixed dates) and safe to re-import: highlight IDs are stable and
// the importer skips IDs it already has.
import { join } from 'node:path';
import type { Highlight, Note, PageTitles } from '../../src/shared/types';
import { HIGHLIGHT_COLORS } from '../../src/shared/constants';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260501);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const SENTENCES = [
  'The best way to understand a system is to change it and watch what breaks.',
  'Most meetings exist because someone was afraid to make a decision alone.',
  'A good default is worth more than a hundred settings nobody will ever open.',
  'Latency is a feature, and users notice it long before they can describe it.',
  'Writing forces you to find out what you actually think.',
  'Every abstraction leaks eventually; the question is whether it leaks somewhere you can see.',
  'Small, boring tools that do one thing well outlast clever frameworks.',
  'The cost of a bug is the time between introducing it and noticing it.',
  'Consistency is what makes an interface feel calm instead of busy.',
  'You do not have a performance problem until you have measured one.',
  'Documentation rots the moment it is separated from the code it describes.',
  'People forgive slow software far more readily than software that loses their work.',
  'A queue is just a decision about where to make people wait.',
  'Naming things is hard because naming forces you to decide what a thing is.',
  'The simplest model that survives contact with real data is usually the right one.',
  'Retries without backoff turn a small outage into a large one.',
  'Good taste is mostly the ability to notice what should be removed.',
  'Reading code is a different skill from writing it, and it is the one you use more.',
  'An index is a promise that you will pay for writes to make reads cheap.',
  'Constraints are not the enemy of creativity; they are where the interesting decisions live.',
  'Attention is the scarcest resource in any interface, so spend it deliberately.',
  'Most of the work in software is deleting code that used to be necessary.',
  'The map is not the territory, but a good map makes the territory legible.',
  'Distributed systems fail in the gaps between the things you thought were atomic.',
  'There is no such thing as a temporary fix once other people depend on it.',
  'Curiosity compounds: each answer makes the next question easier to ask.',
  'A system you cannot observe is a system you cannot trust.',
  'Trade-offs are not flaws in a design; they are the design.',
  'Typography is the quiet part of a product that decides whether you can read it for an hour.',
  'Shipping something small and real beats polishing something large and imaginary.',
  'Caches make fast things faster and make wrong things wrong for longer.',
  'The hardest part of a migration is the period when both worlds have to work.',
  'If two people can read the same page and disagree, the page is the problem.',
  'Memory is not a recording; it is a reconstruction, and it changes each time you recall it.',
  'Whitespace is not empty; it is how the eye knows where one idea ends.',
  'Prefer reversible decisions, and move quickly on them.',
];

const NOTES = [
  'Come back to this.',
  'Disagree with the second half.',
  'Good quote for the talk.',
  'Check the source on this claim.',
  'Same point as the other article on this.',
  'Try this on the next project.',
  'Share with the team.',
  'This is the key idea of the whole piece.',
  'Counterexample: caching layers at the edge.',
  'Need to read the linked paper.',
  'Surprising. Verify before repeating.',
  'Reminds me of the pre-mortem exercise.',
  'Todo: write up my own version of this.',
  'Useful framing for onboarding docs.',
  'Not sure this holds at scale.',
  'Ask Sam what they think.',
];
const LONG_NOTE =
  'This section is worth rereading slowly. The argument builds across three paragraphs and the conclusion only makes sense if you keep the first example in mind, so I want to come back and annotate it properly once I have time to write out the counter-arguments and compare them with the other sources I saved this week.';

interface Site {
  url: string;
  title: string;
  highlights: number;
}

const SITES: Site[] = [
  { url: 'https://paulgraham.com/words.html', title: 'Putting Ideas Into Words', highlights: 6 },
  { url: 'https://rauno.me/craft/interaction-design', title: 'Interaction Design — Rauno Freiberg', highlights: 5 },
  { url: 'https://www.robinsloan.com/lab/attention', title: 'Attention is not a resource — Robin Sloan', highlights: 3 },
  { url: 'https://medium.com/example/warm-software', title: 'On Warm Software — Andy Matuschak', highlights: 4 },
  // User-reported edge case: long title with unbroken runs of letters
  {
    url: 'https://kubernetes.io/docs/concepts/overview/',
    title:
      'Kubernetes -yessssssssssssssssssssssssssssssssssssssssssssssss.orgsssssssssssssssssssssssssssssssss another line wait what what what what what what what what',
    highlights: 5,
  },
  { url: 'https://news.ycombinator.com/item?id=39000000', title: '', highlights: 2 }, // no title: shows the URL
  { url: 'https://example.org/notes/draft', title: '[WIP] # Notes *draft* _v2_ | A > B', highlights: 3 }, // markdown characters
  { url: 'https://example.jp/test', title: '日本語のページ — テスト 🚀', highlights: 2 },
  {
    url: 'https://example.com/a-very-long-article-title',
    title:
      'A Comprehensive and Frankly Exhaustive Look at How Modern Distributed Databases Handle Consistency, Availability, Partition Tolerance, and the Many Compromises Their Designers Quietly Made Along the Way',
    highlights: 4,
  },
  { url: 'https://example.com/long-list', title: 'The Long List (many highlights, scroll test)', highlights: 14 },
  { url: 'https://example.com/single', title: 'One highlight only', highlights: 1 },
  { url: 'https://stripe.com/blog/idempotency', title: 'Designing robust and predictable APIs with idempotency', highlights: 5 },
  { url: 'https://martinfowler.com/articles/microservices.html', title: 'Microservices', highlights: 6 },
  { url: 'https://danluu.com/file-consistency/', title: 'Files are hard', highlights: 4 },
  { url: 'https://jvns.ca/blog/2022/03/23/how-to-get-better-at-debugging/', title: 'Debugging: how to get better at it', highlights: 3 },
  { url: 'https://fasterthanli.me/articles/a-half-hour-to-learn-rust', title: 'A half-hour to learn Rust', highlights: 7 },
  { url: 'https://www.joelonsoftware.com/2000/08/09/the-joel-test-12-steps-to-better-code/', title: 'The Joel Test: 12 Steps to Better Code', highlights: 3 },
  { url: 'https://blog.codinghorror.com/the-best-code-is-no-code-at-all/', title: 'The Best Code is No Code At All', highlights: 2 },
  { url: 'https://overreacted.io/a-complete-guide-to-useeffect/', title: 'A Complete Guide to useEffect — Overreacted', highlights: 8 },
  { url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap', title: 'overflow-wrap - CSS: Cascading Style Sheets | MDN', highlights: 3 },
  { url: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/', title: 'A Complete Guide to Flexbox | CSS-Tricks', highlights: 5 },
  { url: 'https://web.dev/articles/vitals', title: 'Web Vitals | web.dev', highlights: 4 },
  { url: 'https://www.nngroup.com/articles/ten-usability-heuristics/', title: '10 Usability Heuristics for User Interface Design', highlights: 6 },
  { url: 'https://lawsofux.com/', title: 'Laws of UX', highlights: 2 },
  { url: 'https://ciechanow.ski/bicycle/', title: 'Bicycle – Bartosz Ciechanowski', highlights: 3 },
  { url: 'https://acko.net/blog/how-to-fold-a-julia-fractal/', title: 'How to Fold a Julia Fractal', highlights: 2 },
  { url: 'https://www.gwern.net/Scaling-hypothesis', title: 'The Scaling Hypothesis · Gwern.net', highlights: 9 },
  { url: 'https://plato.stanford.edu/entries/consciousness/', title: 'Consciousness (Stanford Encyclopedia of Philosophy)', highlights: 4 },
  { url: 'https://aeon.co/essays/why-we-forget-most-of-what-we-read', title: 'Why we forget most of what we read | Aeon Essays', highlights: 3 },
  { url: 'https://github.com/facebook/react/blob/main/CHANGELOG.md', title: 'react/CHANGELOG.md at main · facebook/react', highlights: 2 },
];

// A few pages the user has "renamed", so custom titles show up in the list too
const RENAMED: PageTitles = {
  'https://paulgraham.com/words.html': 'PG: writing is thinking',
  'https://martinfowler.com/articles/microservices.html': 'Fowler on microservices (reread)',
  'https://example.com/a-very-long-article-title':
    'My shortened title for that very long database article that I renamed because the original was far too long to read',
  'https://example.com/single': 'Renamed single-highlight page',
};

function highlightText(): string {
  const roll = rand();
  if (roll < 0.2) {
    const words = pick(SENTENCES).replace(/[.,;]/g, '').split(' ');
    const start = int(0, Math.max(0, words.length - 7));
    return words.slice(start, start + int(3, 7)).join(' ');
  }
  if (roll < 0.65) return pick(SENTENCES);
  if (roll < 0.9) return Array.from({ length: int(3, 4) }, () => pick(SENTENCES)).join(' ');
  const paragraph = () => Array.from({ length: int(3, 5) }, () => pick(SENTENCES)).join(' ');
  return `${paragraph()}\n\n${paragraph()}`;
}

const COLORS = Object.values(HIGHLIGHT_COLORS);
const END = Date.UTC(2026, 4, 1, 12, 0, 0);
const DAY = 86_400_000;
const emptyPosition = {
  startXPath: '',
  endXPath: '',
  startOffset: 0,
  endOffset: 0,
  textContext: { before: '', after: '' },
};

const highlights: Highlight[] = [];
SITES.forEach((site, siteIndex) => {
  const siteStart = END - rand() * 90 * DAY;
  for (let n = 0; n < site.highlights; n++) {
    const timestamp = Math.round(siteStart + n * rand() * 2 * DAY);
    const noteCount = rand() < 0.45 ? 0 : int(1, rand() < 0.15 ? 5 : 2);
    const notes: Note[] = Array.from({ length: noteCount }, (_, k) => ({
      id: `seed-s${siteIndex + 1}-h${n + 1}-n${k + 1}`,
      text: rand() < 0.1 ? LONG_NOTE : pick(NOTES),
      timestamp: timestamp + (k + 1) * 3_600_000,
    }));
    highlights.push({
      id: `seed-s${siteIndex + 1}-h${n + 1}`,
      url: site.url,
      pageTitle: site.title,
      text: highlightText(),
      notes,
      color: pick(COLORS),
      timestamp,
      position: emptyPosition,
    });
  }
});

const backup = {
  version: '1.0',
  exportDate: new Date(END).toISOString(),
  highlights,
  pageTitles: RENAMED,
  metadata: { totalCount: highlights.length, pageCount: new Set(highlights.map((h) => h.url)).size },
};
const out = join(import.meta.dir, 'seed-30-sites.json');
await Bun.write(out, JSON.stringify(backup, null, 2));

const notes = highlights.reduce((sum, h) => sum + h.notes.length, 0);
console.log(`wrote ${out}`);
console.log(`sites=${backup.metadata.pageCount} highlights=${highlights.length} notes=${notes} renamed=${Object.keys(RENAMED).length}`);
