// Deterministic fixture pages for the anchoring benchmark.
// Each template mimics a common real-world structure; all randomness is seeded.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
export const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

export const SENTENCES = [
  'The author observes that his most successful endeavors—marriage, essays, career—share a common approach.',
  '"Unfolding" is a concept from architect Christopher Alexander.',
  'Rather than imposing a predetermined vision, unfolding means paying attention to what you enjoy doing, then seeking more of it.',
  'Making yourself accessible to interesting people and collaborating on projects.',
  'Iterating continuously—removing frustrations and expanding what makes you feel alive.',
  'Looking back, your life bears little resemblance to your original imagination, yet fits you perfectly.',
  'Good design succeeds when "the form fits the context."',
  'A glove fits a hand; a healthy relationship fits its participants.',
  "An excellent essay aligns truth, writer's needs, and reader's mind.",
  'The context itself contains more wisdom than any individual can hold mentally.',
  'The author warns against visions—fantasies that changing contexts solves problems.',
  "He recounts choosing political science based on romantic notions, only to discover after eighteen months it didn't suit him.",
  'Observe your actual context carefully.',
  'Form mental models about it.',
  'Take small experimental steps based on those models.',
  'Act and gather new information.',
  'Repeat continuously.',
  'Increasing information flow from reality and acting quickly on feedback accelerates unfolding.',
  'Unbundling assumptions, overcoming social fear, and maintaining detachment all enhance the process.',
  'Over a decade of sustained cycling through this feedback loop yields a well-designed life.',
  'Being open to your own body, being embodied, is a precondition for vibing.',
  "Which is why nerds can't vibe.",
  'There is something about physical awareness, proprioception, and the felt sense of being in a body.',
  'The disconnect between thinking and feeling prevents the kind of open, responsive engagement that presence requires.',
  "You can't unfold if you're not in touch with what your body is telling you about the current moment.",
  'The information is there — in tension, in breath, in the subtle orientation of attention.',
  'It requires a different kind of listening.',
  'Software should be warm to the touch.',
  'It should feel like it was made by a person who cared, not a committee that compromised.',
  'The best interface is one that disappears entirely.',
  'Let the user interact directly with the content they care about.',
  'Small teams ship faster because they spend less time coordinating.',
  'Every dependency you add is a promise you will have to keep.',
  'Caching is easy; invalidation is where the bugs live.',
  'Measure first, then optimize the part that actually matters.',
  'Most outages start with a change that looked harmless at the time.',
  'Readable code is code that the next person can safely delete.',
  'The fastest request is the one you never make.',
  'Defaults matter more than options, because most people never change them.',
  'Write the test that would have caught the last bug.',
  'In 2019, the team moved the service to a new region in under six hours.',
  'Prices rose 3.2% year over year, according to the latest report.',
  'Click here to read the full story.',
  'This article was originally published on our blog.',
];

// Boilerplate repeated across a page: makes short highlights ambiguous on purpose.
export const BOILERPLATE = ['Reply', 'Share', 'Report', 'Read more', 'Subscribe to our newsletter', 'Related articles'];

export const WORDS = ['quietly', 'often', 'clearly', 'rarely', 'system', 'garden', 'signal', 'window', 'river', 'pattern', 'budget', 'lantern'];

type Draw = () => string;

// Sentences are drawn without replacement until the pool runs out, so repeats are
// the exception (as on real pages) rather than the rule.
function deck(rng: Rng): Draw {
  let pool: string[] = [];
  return () => {
    if (!pool.length) {
      pool = [...SENTENCES];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool.pop()!;
  };
}

const para = (d: Draw, rng: Rng, lo = 2, hi = 5) => Array.from({ length: int(rng, lo, hi) }, d).join(' ');

// Wrap one phrase of `text` in an inline element (link/em/strong/code) sometimes.
const inline = (rng: Rng, text: string, p = 0.45) => {
  if (rng() > p) return esc(text);
  const words = text.split(' ');
  if (words.length < 6) return esc(text);
  const a = int(rng, 0, words.length - 4);
  const b = a + int(rng, 1, 3);
  const tag = pick(rng, ['a', 'em', 'strong', 'code', 'span']);
  const attr = tag === 'a' ? ' href="https://example.com/x"' : tag === 'span' ? ' class="hl"' : '';
  return (
    esc(words.slice(0, a).join(' ')) +
    ' ' +
    `<${tag}${attr}>${esc(words.slice(a, b).join(' '))}</${tag}>` +
    ' ' +
    esc(words.slice(b).join(' '))
  );
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function article(rng: Rng): string {
  const d = deck(rng);
  const ps = Array.from({ length: int(rng, 6, 11) }, () => `<p>${inline(rng, para(d, rng))}</p>`).join('\n');
  const related = Array.from({ length: 5 }, () => `<li><a href="#">${esc(d())}</a></li>`).join('');
  return `<header><nav><a href="/">Home</a> <a href="/about">About</a> <a href="/rss">${BOILERPLATE[4]}</a></nav></header>
<main><article><h1>${esc(d())}</h1>
${ps}
<p><a href="#">${BOILERPLATE[3]}</a></p></article>
<aside><h3>${BOILERPLATE[5]}</h3><ul>${related}</ul></aside></main>
<footer><p>${esc(SENTENCES[SENTENCES.length - 1])}</p></footer>`;
}

function docs(rng: Rng): string {
  const d = deck(rng);
  const sections = Array.from({ length: int(rng, 3, 6) }, (_, i) => {
    const items = Array.from({ length: int(rng, 3, 6) }, () => `<li>${inline(rng, para(d, rng, 1, 2))}</li>`).join('');
    const code = `<pre><code>const value${i} = compute(${i});\nif (value${i} &gt; limit) {\n  retry(value${i});\n}</code></pre>`;
    return `<section><h2>Section ${i + 1}: ${esc(d().split(' ').slice(0, 4).join(' '))}</h2>
<p>${inline(rng, para(d, rng))}</p><ul>${items}</ul>${code}<p>${inline(rng, para(d, rng, 1, 3))}</p></section>`;
  }).join('\n');
  return `<div class="docs"><nav class="toc"><a href="#">Overview</a> <a href="#">API</a></nav><main><h1>Guide</h1>\n${sections}</main></div>`;
}

function forum(rng: Rng): string {
  const d = deck(rng);
  const said: string[] = [];
  const comments = Array.from({ length: int(rng, 10, 18) }, (_, i) => {
    const body = para(d, rng, 1, 4);
    const quote =
      said.length && rng() < 0.35 ? `<blockquote><p>${esc(pick(rng, said))}</p></blockquote>` : '';
    said.push(body);
    return `<div class="comment"><div class="meta"><span class="user">user${int(rng, 1, 40)}</span> <span class="time">${int(rng, 1, 23)} hours ago</span></div>
<div class="body">${quote}<p>${inline(rng, body)}</p></div>
<div class="actions"><button>${BOILERPLATE[0]}</button> <button>${BOILERPLATE[1]}</button> <button>${BOILERPLATE[2]}</button></div></div>`;
  }).join('\n');
  return `<main><h1>Discussion</h1><div class="thread">\n${comments}\n</div></main>`;
}

function table(rng: Rng): string {
  const d = deck(rng);
  const rows = Array.from({ length: int(rng, 10, 16) }, (_, i) =>
    `<tr><td>Item ${i + 1}</td><td>${inline(rng, para(d, rng, 1, 2))}</td><td>${esc(d())}</td></tr>`
  ).join('\n');
  return `<main><h1>Comparison</h1><p>${inline(rng, para(d, rng))}</p>
<table><thead><tr><th>Name</th><th>Description</th><th>Notes</th></tr></thead><tbody>\n${rows}\n</tbody></table>
<p>${inline(rng, para(d, rng))}</p></main>`;
}

// Source-formatted markup: text nodes contain newlines + indentation, as in
// hand-written or server-templated HTML. Rendered text collapses the whitespace.
function formatted(rng: Rng): string {
  const d = deck(rng);
  const wrapText = (s: string) =>
    s
      .split(' ')
      .map((w, i) => (i > 0 && i % int(rng, 6, 11) === 0 ? '\n          ' + w : w))
      .join(' ');
  const blocks = Array.from({ length: int(rng, 6, 10) }, () => {
    return `      <div class="card">
        <p>
          ${wrapText(para(d, rng)).replace(/</g, '&lt;')}
        </p>
      </div>`;
  }).join('\n');
  return `<div id="app">
  <div class="layout">
    <div class="content">
${blocks}
    </div>
  </div>
</div>`;
}

function big(rng: Rng): string {
  const d = deck(rng);
  const ps = Array.from({ length: 600 }, () => `<p>${inline(rng, para(d, rng, 2, 4), 0.2)}</p>`).join('\n');
  return `<main><article><h1>Long read</h1>\n${ps}\n</article></main>`;
}

export const TEMPLATES = { article, docs, forum, table, formatted, big } as const;
export type TemplateName = keyof typeof TEMPLATES;
