// generate-excerpt-index.js
// Run once offline: node generate-excerpt-index.js
// Produces assets/data/excerpt-index.json — 200 daily literary-identification passages.
//
// ARCHITECTURE NOTE
// The brief called for storing only charStart/charEnd and live-fetching the raw
// Gutenberg text at runtime, "same as Proof". Two things make that unworkable:
//   1. gutenberg.org sends no Access-Control-Allow-Origin header, so a browser
//      fetch from thebunnygame.com is blocked by CORS. Verified with curl.
//   2. Proof does not actually live-fetch. generate-proof-index.js embeds the
//      passage text and proof.js reads entry.passage directly — its comment says
//      "no external fetch needed". Its fetchWithTimeout/cleanSlice are dead code.
// So the passage text is embedded here, matching what Proof really does.
// charStart/charEnd are still emitted for provenance and re-verification.
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CACHE_DIR   = path.join(__dirname, '.gutenberg-cache');
const OUT_PATH    = path.join(__dirname, 'assets', 'data', 'excerpt-index.json');
const TOTAL_TARGET = 200;

// ── Source pool — these get fetched and become correct answers ────────────────
const SOURCES = [
  // English Regency
  { id: 1342, title: 'Pride and Prejudice',                       author: 'Jane Austen',            groups: ['regency'] },
  { id: 161,  title: 'Sense and Sensibility',                      author: 'Jane Austen',            groups: ['regency'] },
  { id: 158,  title: 'Emma',                                       author: 'Jane Austen',            groups: ['regency'] },
  { id: 105,  title: 'Persuasion',                                 author: 'Jane Austen',            groups: ['regency'] },
  { id: 141,  title: 'Mansfield Park',                             author: 'Jane Austen',            groups: ['regency'] },
  // English Victorian
  { id: 98,   title: 'A Tale of Two Cities',                       author: 'Charles Dickens',        groups: ['victorian'] },
  { id: 730,  title: 'Oliver Twist',                               author: 'Charles Dickens',        groups: ['victorian'] },
  { id: 1400, title: 'Great Expectations',                         author: 'Charles Dickens',        groups: ['victorian'] },
  { id: 766,  title: 'David Copperfield',                          author: 'Charles Dickens',        groups: ['victorian'] },
  { id: 1023, title: 'Bleak House',                                author: 'Charles Dickens',        groups: ['victorian'] },
  { id: 145,  title: 'Middlemarch',                                author: 'George Eliot',           groups: ['victorian'] },
  { id: 6688, title: 'The Mill on the Floss',                      author: 'George Eliot',           groups: ['victorian'] },
  { id: 1260, title: 'Jane Eyre',                                  author: 'Charlotte Bronte',       groups: ['victorian'] },
  { id: 768,  title: 'Wuthering Heights',                          author: 'Emily Bronte',           groups: ['victorian'] },
  // Late Victorian
  { id: 110,  title: "Tess of the D'Urbervilles",                  author: 'Thomas Hardy',           groups: ['late-victorian'] },
  { id: 143,  title: 'The Mayor of Casterbridge',                  author: 'Thomas Hardy',           groups: ['late-victorian'] },
  { id: 174,  title: 'The Picture of Dorian Gray',                 author: 'Oscar Wilde',            groups: ['late-victorian'] },
  { id: 2814, title: 'Dubliners',                                  author: 'James Joyce',            groups: ['continental-modern'] },
  // American
  { id: 76,   title: 'Adventures of Huckleberry Finn',             author: 'Mark Twain',             groups: ['american-19c'] },
  { id: 74,   title: 'The Adventures of Tom Sawyer',               author: 'Mark Twain',             groups: ['american-19c'] },
  { id: 2701, title: 'Moby Dick',                                  author: 'Herman Melville',        groups: ['american-19c'] },
  { id: 514,  title: 'Little Women',                               author: 'Louisa May Alcott',      groups: ['american-19c'] },
  { id: 160,  title: 'The Awakening',                              author: 'Kate Chopin',            groups: ['american-19c'] },
  { id: 73,   title: 'The Red Badge of Courage',                   author: 'Stephen Crane',          groups: ['american-19c'] },
  { id: 1661, title: 'The Adventures of Sherlock Holmes',          author: 'Arthur Conan Doyle',     groups: ['late-victorian'] },
  // Gothic
  { id: 84,   title: 'Frankenstein',                               author: 'Mary Shelley',           groups: ['gothic'] },
  { id: 345,  title: 'Dracula',                                    author: 'Bram Stoker',            groups: ['gothic', 'late-victorian'] },
  { id: 43,   title: 'The Strange Case of Dr Jekyll and Mr Hyde',  author: 'Robert Louis Stevenson', groups: ['gothic', 'late-victorian'] },
  // Russian
  { id: 2600, title: 'War and Peace',                              author: 'Leo Tolstoy',            groups: ['russian'] },
  { id: 2554, title: 'Crime and Punishment',                       author: 'Fyodor Dostoevsky',      groups: ['russian', 'continental-modern'] },
  { id: 600,  title: 'Notes from Underground',                     author: 'Fyodor Dostoevsky',      groups: ['russian', 'continental-modern'] },
  { id: 1399, title: 'Anna Karenina',                              author: 'Leo Tolstoy',            groups: ['russian'] },
  // French
  { id: 135,  title: 'Les Misérables',                             author: 'Victor Hugo',            groups: ['french'] },
  { id: 2413, title: 'Madame Bovary',                              author: 'Gustave Flaubert',       groups: ['french', 'continental-modern'] },
  // Continental modern
  { id: 5200, title: 'The Metamorphosis',                          author: 'Franz Kafka',            groups: ['continental-modern'] },
  { id: 219,  title: 'Heart of Darkness',                          author: 'Joseph Conrad',          groups: ['continental-modern', 'late-victorian'] },
  { id: 974,  title: 'The Secret Agent',                           author: 'Joseph Conrad',          groups: ['continental-modern', 'late-victorian'] },
  // Adventure / children's
  { id: 16,   title: 'Peter Pan',                                  author: 'J.M. Barrie',            groups: ['adventure'] },
  { id: 120,  title: 'Treasure Island',                            author: 'Robert Louis Stevenson', groups: ['adventure'] },
];

// ── Distractor-only works — never fetched, only ever shown as wrong options ───
// These widen the option variety so a player cannot learn the answer set.
const DISTRACTOR_ONLY = [
  { title: 'Northanger Abbey',          author: 'Jane Austen',              groups: ['regency'] },
  { title: 'Lady Susan',                author: 'Jane Austen',              groups: ['regency'] },
  { title: 'Ivanhoe',                   author: 'Walter Scott',             groups: ['regency'] },
  { title: 'Waverley',                  author: 'Walter Scott',             groups: ['regency'] },

  { title: 'Hard Times',                author: 'Charles Dickens',          groups: ['victorian'] },
  { title: 'Nicholas Nickleby',         author: 'Charles Dickens',          groups: ['victorian'] },
  { title: 'Dombey and Son',            author: 'Charles Dickens',          groups: ['victorian'] },
  { title: 'Silas Marner',              author: 'George Eliot',             groups: ['victorian'] },
  { title: 'Adam Bede',                 author: 'George Eliot',             groups: ['victorian'] },
  { title: 'Villette',                  author: 'Charlotte Bronte',         groups: ['victorian'] },
  { title: 'The Professor',             author: 'Charlotte Bronte',         groups: ['victorian'] },
  { title: 'Agnes Grey',                author: 'Anne Bronte',              groups: ['victorian'] },
  { title: 'North and South',           author: 'Elizabeth Gaskell',        groups: ['victorian'] },
  { title: 'Cranford',                  author: 'Elizabeth Gaskell',        groups: ['victorian'] },
  { title: 'Vanity Fair',               author: 'William Makepeace Thackeray', groups: ['victorian'] },
  { title: 'Barchester Towers',         author: 'Anthony Trollope',         groups: ['victorian'] },

  { title: 'Jude the Obscure',          author: 'Thomas Hardy',             groups: ['late-victorian'] },
  { title: 'Far from the Madding Crowd', author: 'Thomas Hardy',            groups: ['late-victorian'] },
  { title: 'The Return of the Native',  author: 'Thomas Hardy',             groups: ['late-victorian'] },
  { title: 'The Woman in White',        author: 'Wilkie Collins',           groups: ['late-victorian'] },
  { title: 'The Moonstone',             author: 'Wilkie Collins',           groups: ['late-victorian'] },
  { title: 'The Time Machine',          author: 'H.G. Wells',               groups: ['late-victorian'] },
  { title: 'The War of the Worlds',     author: 'H.G. Wells',               groups: ['late-victorian'] },
  { title: 'New Grub Street',           author: 'George Gissing',           groups: ['late-victorian'] },
  { title: 'The Hound of the Baskervilles', author: 'Arthur Conan Doyle',   groups: ['late-victorian'] },
  { title: 'A Study in Scarlet',        author: 'Arthur Conan Doyle',       groups: ['late-victorian'] },
  { title: "Lady Windermere's Fan", author: 'Oscar Wilde',             groups: ['late-victorian'] },
  { title: 'The Importance of Being Earnest', author: 'Oscar Wilde',   groups: ['late-victorian'] },

  { title: 'The Scarlet Letter',        author: 'Nathaniel Hawthorne',      groups: ['american-19c'] },
  { title: 'The House of the Seven Gables', author: 'Nathaniel Hawthorne',  groups: ['american-19c'] },
  { title: 'The Portrait of a Lady',    author: 'Henry James',              groups: ['american-19c'] },
  { title: 'The Turn of the Screw',     author: 'Henry James',              groups: ['american-19c'] },
  { title: 'The House of Mirth',        author: 'Edith Wharton',            groups: ['american-19c'] },
  { title: 'Billy Budd',                author: 'Herman Melville',          groups: ['american-19c'] },
  { title: 'Life on the Mississippi',   author: 'Mark Twain',               groups: ['american-19c'] },
  { title: "A Connecticut Yankee in King Arthur's Court", author: 'Mark Twain', groups: ['american-19c'] },
  { title: 'Little Men',                author: 'Louisa May Alcott',        groups: ['american-19c'] },
  { title: 'Sister Carrie',             author: 'Theodore Dreiser',         groups: ['american-19c'] },
  { title: 'The Call of the Wild',      author: 'Jack London',              groups: ['american-19c'] },
  { title: 'Maggie: A Girl of the Streets', author: 'Stephen Crane',        groups: ['american-19c'] },

  { title: 'The Brothers Karamazov',    author: 'Fyodor Dostoevsky',        groups: ['russian', 'continental-modern'] },
  { title: 'The Idiot',                 author: 'Fyodor Dostoevsky',        groups: ['russian', 'continental-modern'] },
  { title: 'The Death of Ivan Ilyich',  author: 'Leo Tolstoy',              groups: ['russian'] },
  { title: 'Resurrection',              author: 'Leo Tolstoy',              groups: ['russian'] },
  { title: 'Fathers and Sons',          author: 'Ivan Turgenev',            groups: ['russian'] },
  { title: 'Dead Souls',                author: 'Nikolai Gogol',            groups: ['russian'] },

  { title: 'The Hunchback of Notre-Dame', author: 'Victor Hugo',            groups: ['french'] },
  { title: 'Sentimental Education',     author: 'Gustave Flaubert',         groups: ['french', 'continental-modern'] },
  { title: 'The Count of Monte Cristo', author: 'Alexandre Dumas',          groups: ['french'] },
  { title: 'Père Goriot',               author: 'Honoré de Balzac',         groups: ['french'] },
  { title: 'Germinal',                  author: 'Émile Zola',               groups: ['french'] },
  { title: 'The Red and the Black',     author: 'Stendhal',                 groups: ['french'] },

  { title: 'The Trial',                 author: 'Franz Kafka',              groups: ['continental-modern'] },
  { title: 'The Castle',                author: 'Franz Kafka',              groups: ['continental-modern'] },
  { title: 'A Portrait of the Artist as a Young Man', author: 'James Joyce', groups: ['continental-modern'] },
  { title: 'Lord Jim',                  author: 'Joseph Conrad',            groups: ['continental-modern', 'late-victorian'] },
  { title: 'Nostromo',                  author: 'Joseph Conrad',            groups: ['continental-modern'] },

  { title: 'The Castle of Otranto',     author: 'Horace Walpole',           groups: ['gothic'] },
  { title: 'Carmilla',                  author: 'Sheridan Le Fanu',         groups: ['gothic'] },
  { title: 'The Mysteries of Udolpho',  author: 'Ann Radcliffe',            groups: ['gothic'] },
  { title: 'The Fall of the House of Usher', author: 'Edgar Allan Poe',     groups: ['gothic'] },
  { title: 'Melmoth the Wanderer',      author: 'Charles Maturin',          groups: ['gothic'] },

  { title: 'Kidnapped',                 author: 'Robert Louis Stevenson',   groups: ['adventure'] },
  { title: 'The Black Arrow',           author: 'Robert Louis Stevenson',   groups: ['adventure'] },
  { title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', groups: ['adventure'] },
  { title: 'Through the Looking-Glass', author: 'Lewis Carroll',            groups: ['adventure'] },
  { title: 'The Wind in the Willows',   author: 'Kenneth Grahame',          groups: ['adventure'] },
  { title: 'The Jungle Book',           author: 'Rudyard Kipling',          groups: ['adventure'] },
  { title: 'The Secret Garden',         author: 'Frances Hodgson Burnett',  groups: ['adventure'] },
  { title: 'The Little White Bird',     author: 'J.M. Barrie',              groups: ['adventure'] },
];

const label = w => `${w.title} — ${w.author}`;
const ALL_WORKS = SOURCES.concat(DISTRACTOR_ONLY);

// ── Deterministic RNG (mulberry32) so re-runs reproduce the same index ────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(0xE7CE97);

// ── Fetch with disk cache ────────────────────────────────────────────────────
function httpGet(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (bunnygame index builder)' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        httpGet(res.headers.location, timeoutMs).then(resolve, reject); return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => resolve(buf));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function getBook(id) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `pg${id}.txt`);
  if (fs.existsSync(cached)) return { text: fs.readFileSync(cached, 'utf8'), cached: true };

  // Gutenberg serves a few books only under the -0 / -8 variants
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      const text = await httpGet(u);
      fs.writeFileSync(cached, text);
      return { text, cached: false };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ── Gutenberg boilerplate ────────────────────────────────────────────────────
function stripBoilerplate(raw) {
  const startRe = /\*{3}\s*START OF (THE |THIS )?PROJECT GUTENBERG[^\n]*/i;
  const endRe   = /\*{3}\s*END OF (THE |THIS )?PROJECT GUTENBERG[^\n]*/i;
  let start = 0;
  const sm = raw.search(startRe);
  if (sm !== -1) { const nl = raw.indexOf('\n', sm); start = nl !== -1 ? nl + 1 : sm; }
  let end = raw.length;
  const em = raw.search(endRe);
  if (em !== -1) end = em;
  return { content: raw.slice(start, end), baseOffset: start };
}

// Confirm the fetched file really is the work we think it is. A wrong Gutenberg
// id would attribute a passage to the wrong book — fatal for this game.
function verifyTitle(raw, expectedTitle) {
  const head = raw.slice(0, 1500).replace(/\s+/g, ' ').toLowerCase();
  const norm = s => s.toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const t = norm(expectedTitle);
  if (norm(head).includes(t)) return { ok: true };
  // Fall back to a distinctive-word check (handles "Moby Dick" vs "Moby-Dick; or, The Whale")
  const words = t.split(' ').filter(w => w.length > 3);
  const hits = words.filter(w => norm(head).includes(w)).length;
  if (words.length && hits / words.length >= 0.6) return { ok: true, fuzzy: true };
  const m = raw.slice(0, 400).match(/Title:\s*([^\r\n]+)/i);
  return { ok: false, found: m ? m[1].trim() : head.slice(0, 90) };
}

// ── Sentence boundaries ──────────────────────────────────────────────────────
// A naive /[.!?]/ split breaks on "Mr. Darcy" and would corrupt every stage
// boundary, so known abbreviations and single initials are skipped.
const ABBREV = new Set([
  'mr','mrs','ms','dr','st','prof','rev','hon','jr','sr','esq','capt','col',
  'gen','lt','sgt','maj','sgt','vs','etc','no','co','inc','ltd','mt','ft',
  'ave','viz','cf','al','ca','vol','ch','pp','fig','eg','ie','messrs','mme','mlle',
]);

function findSentenceEnds(text) {
  const ends = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;

    // absorb trailing quotes/brackets that belong to the sentence
    let j = i + 1;
    while (j < text.length && /["'\u201D\u2019)\]]/.test(text[j])) j++;

    // must be followed by end-of-text or whitespace + a capital/quote opener
    if (j < text.length) {
      if (!/\s/.test(text[j])) continue;
      const rest = text.slice(j).replace(/^\s+/, '');
      if (!rest) { ends.push(j); break; }
      if (!/^[A-Z\u201C"'(\u2018\u201C]/.test(rest)) continue;
    }

    if (c === '.') {
      const before = text.slice(0, i);
      const wm = before.match(/([A-Za-z]+)$/);
      if (wm) {
        const w = wm[1].toLowerCase();
        if (ABBREV.has(w)) continue;
        if (wm[1].length === 1 && /[A-Z]/.test(wm[1])) continue;   // initial, e.g. "J. M. Barrie"
      }
      // decimal or numbered list
      if (/\d$/.test(before) && /^\s*\d/.test(text.slice(j))) continue;
    }
    ends.push(j);
    i = j - 1;
  }
  if (!ends.length || ends[ends.length - 1] < text.length) ends.push(text.length);
  return ends;
}

const wordCount = s => s.trim().split(/\s+/).filter(Boolean).length;

// ── Paragraph extraction ─────────────────────────────────────────────────────
const CHAPTER_RE = /^(chapter|part|book|section|volume|act|scene|letter)\b/i;
const HEADING_RE = /^[A-Z][A-Z\s\-'.,]{8,}$|^_{3,}$|^\*{3,}$|^-{3,}$/;

function findParagraphs(content) {
  const out = [];
  const re = /(\r?\n){2,}/g;
  let last = 0, m;
  const push = (rawStart, rawPara) => {
    const cleaned = rawPara.replace(/\r/g, '').replace(/\n/g, ' ')
      .replace(/_/g, '').replace(/\s{2,}/g, ' ').trim();
    if (cleaned) out.push({ text: cleaned, rawStart, rawLen: rawPara.length });
  };
  while ((m = re.exec(content)) !== null) {
    push(last, content.slice(last, m.index));
    last = m.index + m[0].length;
  }
  if (last < content.length) push(last, content.slice(last));
  return out;
}

// Dense prose, per the brief: 4-8 sentences, 80-200 words, not dialogue-only,
// not a heading, and a first sentence long enough that stage 1 and stage 2 differ.
function evaluateParagraph(text) {
  const wc = wordCount(text);
  if (wc < 80 || wc > 200) return null;
  if (CHAPTER_RE.test(text)) return null;
  if (HEADING_RE.test(text)) return null;
  if (/^\[/.test(text)) return null;

  // Must read as a finished paragraph. Gutenberg prose often ends on a colon or
  // dash leading into the next paragraph's dialogue ("he said to me:--"), which
  // would leave the stage-4 reveal dangling mid-thought.
  if (!/[.!?]["'\u201D\u2019)\]]*$/.test(text.trim())) return null;

  const ends = findSentenceEnds(text);
  if (ends.length < 4 || ends.length > 8) return null;

  // Reject dialogue-dominated paragraphs
  const quoted = (text.match(/[\u201C"][^\u201C\u201D"]{10,}[\u201D"]/g) || []).join(' ').length;
  if (quoted / text.length > 0.45) return null;
  if (/^[\u201C"']/.test(text)) return null;

  const s1 = text.slice(0, ends[0]).trim();
  const s2 = text.slice(0, ends[1]).trim();
  if (wordCount(s1) < 8) return null;                  // stage 2 must beat stage 1
  if (wordCount(s1) > 90) return null;                 // runaway first sentence
  if (wordCount(text.slice(ends[0], ends[1])) < 4) return null;

  // Stage 1 is the first three words — they must be real words
  const first3 = text.trim().split(/\s+/).slice(0, 3);
  if (first3.length < 3) return null;
  if (!first3.every(w => /[A-Za-z]/.test(w))) return null;

  return { sentences: ends.length, words: wc, stage2End: ends[0], stage3End: ends[1] };
}

// ── Distractor assignment ────────────────────────────────────────────────────
// Same-author (hardest) mixed with same-era-different-author (hard). Never
// cross-era: candidates must share a group tag with the correct work.
const usedSets   = new Map();   // correctLabel -> Set of "a|b|c" signatures
const usageCount = new Map();   // correctLabel -> Map(distractorLabel -> times used)

function pickDistractors(src) {
  const correct = label(src);
  const sameAuthor = ALL_WORKS.filter(w => w.author === src.author && w.title !== src.title);
  const sameEra = ALL_WORKS.filter(w =>
    w.author !== src.author && w.groups.some(g => src.groups.includes(g)));

  if (!usedSets.has(correct)) usedSets.set(correct, new Set());
  if (!usageCount.has(correct)) usageCount.set(correct, new Map());
  const seen  = usedSets.get(correct);
  const usage = usageCount.get(correct);
  const timesUsed = w => usage.get(label(w)) || 0;

  // Prefer the least-reused options so combinations vary across a work's passages
  const leastUsedShuffled = list => list
    .map(w => ({ w, k: timesUsed(w) + rand() * 0.9 }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.w);

  for (let attempt = 0; attempt < 400; attempt++) {
    // 1-2 same-author when the author has other works in the pool, else 0
    let wantAuthor = 0;
    if (sameAuthor.length >= 2) wantAuthor = rand() < 0.5 ? 2 : 1;
    else if (sameAuthor.length === 1) wantAuthor = 1;
    wantAuthor = Math.min(wantAuthor, sameAuthor.length);

    const picked = [];
    leastUsedShuffled(sameAuthor).forEach(w => {
      if (picked.length < wantAuthor) picked.push(w);
    });
    leastUsedShuffled(sameEra).forEach(w => {
      if (picked.length < 3 && !picked.some(p => p.title === w.title)) picked.push(w);
    });
    if (picked.length < 3) continue;

    const labels = picked.map(label);
    const sig = labels.slice().sort().join('|');
    if (seen.has(sig)) continue;               // no repeated trio for this work

    seen.add(sig);
    labels.forEach(l => usage.set(l, (usage.get(l) || 0) + 1));

    // Shuffle so position carries no signal
    for (let i = labels.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [labels[i], labels[j]] = [labels[j], labels[i]];
    }
    return labels;
  }
  return null;
}

// ── Per-source processing ────────────────────────────────────────────────────
async function processSource(src, needed) {
  let book;
  try { book = await getBook(src.id); }
  catch (e) { console.log(`    FETCH FAILED: ${e.message}`); return { entries: [], candidates: 0 }; }

  console.log(`    ${(book.text.length / 1024).toFixed(0)} KB${book.cached ? ' (cached)' : ''}`);

  const v = verifyTitle(book.text, src.title);
  if (!v.ok) {
    console.log(`    ✗ TITLE MISMATCH — id ${src.id} looks like: "${v.found}"`);
    return { entries: [], candidates: 0, mismatch: v.found };
  }
  if (v.fuzzy) console.log(`    (title matched loosely)`);

  const { content, baseOffset } = stripBoilerplate(book.text);
  const paras = findParagraphs(content);

  const candidates = [];
  paras.forEach(p => {
    const ev = evaluateParagraph(p.text);
    if (ev) candidates.push({ para: p, ev });
  });
  console.log(`    ${paras.length} paragraphs → ${candidates.length} usable`);
  if (!candidates.length) return { entries: [], candidates: 0 };

  // Bias toward the opening of the book (more recognisable) but spread out so
  // the passages for one work are not all adjacent.
  const frontPool = candidates.slice(0, Math.max(needed, Math.ceil(candidates.length * 0.55)));
  const pool = frontPool.length >= needed ? frontPool : candidates;

  const entries = [];
  const step = pool.length / needed;
  for (let slot = 0; slot < needed; slot++) {
    const idx = Math.min(pool.length - 1, Math.floor(slot * step + step * 0.5));
    const c = pool[idx];
    if (!c || c.taken) continue;
    c.taken = true;

    const distractors = pickDistractors(src);
    if (!distractors) { console.log(`    WARNING: no distractor set for slot ${slot + 1}`); continue; }

    const passage = c.para.text;
    entries.push({
      gutenbergId:       src.id,
      title:             src.title,
      author:            src.author,
      passage,
      charStart:         baseOffset + c.para.rawStart,
      charEnd:           baseOffset + c.para.rawStart + c.para.rawLen,
      correctAnswer:     label(src),
      distractors,
      stage2SentenceEnd: c.ev.stage2End,
      stage3SentenceEnd: c.ev.stage3End,
      sentenceCount:     c.ev.sentences,
      wordCount:         c.ev.words,
    });
  }
  console.log(`    → ${entries.length}/${needed} entries`);
  return { entries, candidates: candidates.length, pool };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`generate-excerpt-index.js — target ${TOTAL_TARGET} passages from ${SOURCES.length} sources\n`);

  const perSource = Math.floor(TOTAL_TARGET / SOURCES.length);
  const all = [];
  const shortfall = [];
  const state = [];

  for (let i = 0; i < SOURCES.length; i++) {
    const src = SOURCES[i];
    console.log(`[${i + 1}/${SOURCES.length}] ${src.title} — ${src.author} (pg${src.id})`);
    const r = await processSource(src, perSource);
    all.push(...r.entries);
    state.push({ src, ...r });
    if (r.entries.length < perSource) shortfall.push({ src, got: r.entries.length, want: perSource });
    if (!r.cached) await new Promise(r2 => setTimeout(r2, 400));
  }

  // Redistribute the deficit onto sources that have spare usable paragraphs
  let deficit = TOTAL_TARGET - all.length;
  if (deficit > 0) {
    console.log(`\nShort by ${deficit} — redistributing across sources with spare paragraphs`);
    let progress = true;
    while (deficit > 0 && progress) {
      progress = false;
      for (const st of state) {
        if (deficit <= 0) break;
        if (!st.pool) continue;
        const free = st.pool.find(c => !c.taken);
        if (!free) continue;
        const distractors = pickDistractors(st.src);
        if (!distractors) continue;
        free.taken = true;
        const { content, baseOffset } = stripBoilerplate(fs.readFileSync(path.join(CACHE_DIR, `pg${st.src.id}.txt`), 'utf8'));
        all.push({
          gutenbergId: st.src.id, title: st.src.title, author: st.src.author,
          passage: free.para.text,
          charStart: baseOffset + free.para.rawStart,
          charEnd: baseOffset + free.para.rawStart + free.para.rawLen,
          correctAnswer: label(st.src), distractors,
          stage2SentenceEnd: free.ev.stage2End, stage3SentenceEnd: free.ev.stage3End,
          sentenceCount: free.ev.sentences, wordCount: free.ev.words,
        });
        deficit--; progress = true;
      }
    }
  }

  // Stable order, sequential ids
  all.sort((a, b) => a.gutenbergId - b.gutenbergId || a.charStart - b.charStart);
  all.forEach((e, i) => { e.id = i + 1; });
  const ordered = all.map(e => ({
    id: e.id, gutenbergId: e.gutenbergId, title: e.title, author: e.author,
    passage: e.passage, charStart: e.charStart, charEnd: e.charEnd,
    correctAnswer: e.correctAnswer, distractors: e.distractors,
    stage2SentenceEnd: e.stage2SentenceEnd, stage3SentenceEnd: e.stage3SentenceEnd,
    sentenceCount: e.sentenceCount, wordCount: e.wordCount,
  }));

  console.log(`\n✓ ${ordered.length} entries`);
  if (shortfall.length) {
    console.log('Sources that under-delivered:');
    shortfall.forEach(s => console.log(`  ${s.src.title}: ${s.got}/${s.want}`));
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(ordered, null, 2));
  console.log(`✓ Written to ${OUT_PATH}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
