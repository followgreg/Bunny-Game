// generate-proof-index.js
// Run once offline: node generate-proof-index.js
// Produces assets/data/proof-index.json — metadata only, no literary text.
'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ── Source pool ───────────────────────────────────────────────────────────────
const SOURCES = [
  { id: 1342, title: 'Pride and Prejudice',               author: 'Jane Austen' },
  { id: 98,   title: 'A Tale of Two Cities',              author: 'Charles Dickens' },
  { id: 76,   title: 'Adventures of Huckleberry Finn',    author: 'Mark Twain' },
  { id: 74,   title: 'The Adventures of Tom Sawyer',      author: 'Mark Twain' },
  { id: 2701, title: 'Moby-Dick',                         author: 'Herman Melville' },
  { id: 174,  title: 'The Picture of Dorian Gray',        author: 'Oscar Wilde' },
  { id: 161,  title: 'Sense and Sensibility',             author: 'Jane Austen' },
  { id: 1400, title: 'Great Expectations',                author: 'Charles Dickens' },
  { id: 158,  title: 'Emma',                              author: 'Jane Austen' },
  { id: 11,   title: "Alice's Adventures in Wonderland",  author: 'Lewis Carroll' },
  { id: 84,   title: 'Frankenstein',                      author: 'Mary Shelley' },
  { id: 345,  title: 'Dracula',                           author: 'Bram Stoker' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle' },
  { id: 730,  title: 'Oliver Twist',                      author: 'Charles Dickens' },
  { id: 1260, title: 'Jane Eyre',                         author: 'Charlotte Bronte' },
  { id: 768,  title: 'Wuthering Heights',                 author: 'Emily Bronte' },
  { id: 2814, title: 'Dubliners',                         author: 'James Joyce' },
  { id: 5200, title: 'The Metamorphosis',                 author: 'Franz Kafka' },
  { id: 16,   title: 'Peter Pan',                         author: 'J.M. Barrie' },
  { id: 219,  title: 'Heart of Darkness',                 author: 'Joseph Conrad' },
  { id: 514,  title: 'Little Women',                      author: 'Louisa May Alcott' },
  { id: 203,  title: "Uncle Tom's Cabin",                 author: 'Harriet Beecher Stowe' },
  { id: 1232, title: 'The Prince',                        author: 'Niccolo Machiavelli' },
  { id: 2600, title: 'War and Peace',                     author: 'Leo Tolstoy' },
  { id: 2554, title: 'Crime and Punishment',              author: 'Fyodor Dostoevsky' },
];

const PASSAGES_PER_SOURCE = 8;   // 25 × 8 = 200
const MIN_WORDS  = 150;
const MAX_WORDS  = 250;

// ── Substitution map: char → replacement ─────────────────────────────────────
// Pick visually close / keyboard-adjacent pairs that look like genuine print typos.
const SUBS = {
  a: 'e', e: 'a', o: 'u', i: 'e',
  n: 'm', m: 'n', h: 'b', r: 'n',
  d: 'b', s: 'z', t: 'r', l: 'k',
};

// ── Too-common words — never target these ─────────────────────────────────────
const TOO_COMMON = new Set([
  'there','their','these','those','which','would','could','should','about',
  'other','after','first','where','while','being','every','still','under',
  'never','shall','might','right','great','small','again','think','going',
  'found','since','until','often','taken','given','known','quite','place',
  'thing','young','hands','stood','heard','years','house','woman','women',
  'rooms','heart','world','asked','looked','myself','himself','herself',
  'itself','enough','before','seemed','turned','called','really','always',
  'little','something','nothing','anything','everything','whether','having',
  'making','coming','getting','looking','seeing','thought','through','another',
  'without','between','against','during','become','became','however',
]);

// ── HTTP GET → string ─────────────────────────────────────────────────────────
function fetchText(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchText(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end',  () => resolve(buf));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// ── Strip Project Gutenberg header/footer ─────────────────────────────────────
function stripBoilerplate(rawText) {
  const startRe = /\*{3}\s*START OF (THE |THIS )?PROJECT GUTENBERG[^\n]*/i;
  const endRe   = /\*{3}\s*END OF (THE |THIS )?PROJECT GUTENBERG[^\n]*/i;

  let startOffset = 0;
  const sm = rawText.search(startRe);
  if (sm !== -1) {
    const nl = rawText.indexOf('\n', sm);
    startOffset = nl !== -1 ? nl + 1 : sm;
  } else {
    // Fall back: skip first 3000 chars (typical header length)
    startOffset = Math.min(3000, Math.floor(rawText.length * 0.02));
  }

  let endOffset = rawText.length;
  const em = rawText.search(endRe);
  if (em !== -1) endOffset = em;

  return {
    content: rawText.slice(startOffset, endOffset),
    baseOffset: startOffset,
  };
}

// ── Prose paragraph detector ──────────────────────────────────────────────────
const CHAPTER_RE  = /^(chapter|CHAPTER|PART\s|BOOK\s|SECTION\s|VOLUME\s)/i;
const HEADING_RE  = /^[A-Z][A-Z\s\-]{8,}$|^_{3,}$|^\*{3,}$|^-{3,}$/;
const BRACKET_RE  = /^\[/;

function isProseParagraph(text) {
  if (text.length < 300) return false;           // too short in chars
  const wc = text.split(/\s+/).length;
  if (wc < 50 || wc > 600) return false;
  if (CHAPTER_RE.test(text)) return false;
  if (HEADING_RE.test(text)) return false;
  if (BRACKET_RE.test(text)) return false;
  // Reject if more than 25% of the text is inside quotation marks at line-start
  // (indicates heavy dialogue formatting)
  const lines = text.split(/\n/);
  const dialogLines = lines.filter(l => /^\s*["'""]/.test(l));
  if (lines.length > 3 && dialogLines.length / lines.length > 0.25) return false;
  return true;
}

// ── Split content into paragraphs with raw offsets ───────────────────────────
function findParagraphs(content) {
  const results = [];
  // Gutenberg files use \r\n line endings; paragraph breaks are \r\n\r\n (or \n\n)
  const re = /(\r?\n){2,}/g;
  let lastEnd = 0;
  let m;

  while ((m = re.exec(content)) !== null) {
    const rawPara = content.slice(lastEnd, m.index);
    const cleaned = rawPara.replace(/\r/g, '').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (isProseParagraph(cleaned)) {
      results.push({ text: cleaned, rawStart: lastEnd, rawLen: rawPara.length });
    }
    lastEnd = m.index + m[0].length;
  }
  // Last segment
  if (lastEnd < content.length) {
    const rawPara = content.slice(lastEnd);
    const cleaned = rawPara.replace(/\r/g, '').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (isProseParagraph(cleaned)) {
      results.push({ text: cleaned, rawStart: lastEnd, rawLen: rawPara.length });
    }
  }
  return results;
}

// ── Word count ────────────────────────────────────────────────────────────────
function wc(text) { return text.trim().split(/\s+/).length; }

// ── Trim passage to MAX_WORDS, ending at sentence boundary where possible ─────
function trimPassage(text) {
  const words = text.trim().split(/\s+/);
  if (words.length <= MAX_WORDS) return text.trim();
  const joined = words.slice(0, MAX_WORDS).join(' ');
  // Try to end cleanly on a sentence
  const lastPeriod = joined.lastIndexOf('. ');
  if (lastPeriod > 0 && lastPeriod > joined.length * 0.6) {
    return joined.slice(0, lastPeriod + 1);
  }
  return joined;
}

// ── First sentence end (char offset within passage) ───────────────────────────
function firstSentenceEnd(text) {
  const m = text.match(/^.+?[.!?](?:\s|$)/);
  return m ? m[0].length : 0;
}

// ── Escape for RegExp ─────────────────────────────────────────────────────────
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── Count word occurrences (case-insensitive, word-boundary) ──────────────────
function countWord(text, word) {
  return (text.match(new RegExp('\\b' + escRe(word) + '\\b', 'gi')) || []).length;
}

// ── Find the best typo-target word in afterFirstSentence portion ──────────────
function findTypoTarget(passage, firstEnd) {
  const after = passage.slice(firstEnd);
  const re = /\b([a-z]{5,10})\b/g;
  const candidates = [];
  let m;
  while ((m = re.exec(after)) !== null) {
    const w = m[1];
    if (TOO_COMMON.has(w)) continue;
    if (countWord(passage, w) !== 1) continue;  // must appear exactly once
    candidates.push({ word: w, pos: m.index });
  }
  if (!candidates.length) return null;

  // Prefer words in the middle 40-70% of the after-first-sentence portion
  const lo = after.length * 0.2;
  const hi = after.length * 0.75;
  const mid = candidates.filter(c => c.pos >= lo && c.pos <= hi);
  const pool = mid.length ? mid : candidates;
  return pool[Math.floor(pool.length / 2)].word;
}

// ── Substitution typo ─────────────────────────────────────────────────────────
function makeSubstitution(word) {
  // Try positions 1..end (never position 0)
  for (let i = 1; i < word.length; i++) {
    const rep = SUBS[word[i]];
    if (rep) return word.slice(0, i) + rep + word.slice(i + 1);
  }
  return null;
}

// ── Transposition typo ────────────────────────────────────────────────────────
function makeTransposition(word) {
  const mid = Math.floor(word.length / 2);
  // Try swapping pairs from the middle inward, never involving position 0
  for (let i = mid; i >= 1; i--) {
    if (word[i] !== word[i - 1]) {
      return word.slice(0, i - 1) + word[i] + word[i - 1] + word.slice(i + 1);
    }
  }
  for (let i = mid; i < word.length - 1; i++) {
    if (word[i] !== word[i + 1]) {
      return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
    }
  }
  return null;
}

// ── Typo-type pattern — roughly half/half, not predictable ───────────────────
const TYPO_PATTERN = [
  'substitution','transposition','substitution','transposition','substitution',
  'transposition','transposition','substitution','transposition','substitution',
  'substitution','transposition','transposition','substitution','substitution',
  'transposition','substitution','transposition','substitution','transposition',
];

// ── Try to build one index entry from a paragraph ────────────────────────────
function buildEntry(para, baseOffset, source, id, typoType) {
  const passage = trimPassage(para.text);
  const count   = wc(passage);
  if (count < MIN_WORDS || count > MAX_WORDS) return null;

  const firstEnd = firstSentenceEnd(passage);
  if (firstEnd < 30 || firstEnd >= passage.length - 80) return null;

  const target = findTypoTarget(passage, firstEnd);
  if (!target) return null;

  const useTransposition = (typoType === 'transposition');
  let corrupted = useTransposition ? makeTransposition(target) : makeSubstitution(target);
  if (!corrupted) corrupted = useTransposition ? makeSubstitution(target) : makeTransposition(target);
  if (!corrupted || corrupted === target) return null;

  // Ensure corrupted form doesn't already appear in the passage
  if (countWord(passage, corrupted) > 0) return null;

  // charStart is offset in the FULL raw file (baseOffset = boilerplate offset)
  const charStart = baseOffset + para.rawStart;
  // charEnd is generous — runtime will clean and trim
  const charEnd   = charStart + para.rawLen;

  return {
    id,
    gutenbergId:       source.id,
    title:             source.title,
    author:            source.author,
    charStart,
    charEnd,
    typoWordOriginal:  target,
    typoWordCorrupted: corrupted,
    typoType:          useTransposition ? 'transposition' : 'substitution',
    firstSentenceEnd:  firstEnd,
  };
}

// ── Process one Gutenberg source ─────────────────────────────────────────────
async function processSource(source, needed, startId) {
  const url = `https://www.gutenberg.org/cache/epub/${source.id}/pg${source.id}.txt`;
  process.stdout.write(`  Fetching pg${source.id}.txt ... `);

  let rawText;
  try {
    rawText = await fetchText(url);
    console.log(`${(rawText.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    return [];
  }

  const { content, baseOffset } = stripBoilerplate(rawText);
  const paras = findParagraphs(content);
  console.log(`    ${paras.length} prose paragraphs found`);

  if (paras.length === 0) {
    console.log('    No paragraphs — skipping');
    return [];
  }

  // Distribute 'needed' slots evenly across paragraphs
  const entries = [];
  const step    = Math.max(1, Math.floor(paras.length / needed));
  const used    = new Set();

  for (let slot = 0; slot < needed; slot++) {
    const target = Math.min(slot * step + Math.floor(step / 2), paras.length - 1);
    const tType  = TYPO_PATTERN[(startId + entries.length) % TYPO_PATTERN.length];

    let entry = null;
    for (let delta = 0; delta <= 15 && !entry; delta++) {
      for (const sign of [0, 1, -1]) {
        const idx = target + delta * sign;
        if (idx < 0 || idx >= paras.length || used.has(idx)) continue;
        entry = buildEntry(paras[idx], baseOffset, source, startId + entries.length + 1, tType);
        if (entry) { used.add(idx); break; }
      }
    }

    if (entry) {
      entries.push(entry);
    } else {
      console.log(`    WARNING: could not fill slot ${slot + 1}`);
    }
  }

  console.log(`    → ${entries.length}/${needed} entries`);
  return entries;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('generate-proof-index.js');
  console.log(`${SOURCES.length} sources × ${PASSAGES_PER_SOURCE} passages = ${SOURCES.length * PASSAGES_PER_SOURCE} target entries\n`);

  const all = [];

  for (let si = 0; si < SOURCES.length; si++) {
    const src = SOURCES[si];
    console.log(`[${si + 1}/${SOURCES.length}] ${src.title} (${src.author}, ID ${src.id})`);
    const entries = await processSource(src, PASSAGES_PER_SOURCE, all.length);
    all.push(...entries);
    if (si < SOURCES.length - 1) await new Promise(r => setTimeout(r, 600));
  }

  // Re-assign clean sequential IDs
  all.forEach((e, i) => { e.id = i + 1; });

  console.log(`\n✓ Total: ${all.length} entries`);

  // Distribution report
  const byType   = {};
  const bySource = {};
  for (const e of all) {
    byType[e.typoType]    = (byType[e.typoType]    || 0) + 1;
    bySource[e.gutenbergId] = (bySource[e.gutenbergId] || 0) + 1;
  }
  console.log('Typo types:', byType);
  console.log('Per source:', bySource);

  // Write output
  const outPath = path.join(__dirname, 'assets', 'data', 'proof-index.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`\n✓ Written to ${outPath}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
