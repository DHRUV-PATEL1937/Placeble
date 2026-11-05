// Usage: node scripts/import-coding-library.mjs <local problem-specifications checkout>
// Mechanical import of MIT-licensed, pinned Exercism specifications. No AI generation.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.argv[2];
if (!root) throw new Error('Pass the local Exercism problem-specifications checkout.');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const selections = {
  strings: ['acronym', 'anagram', 'isogram', 'pangram', 'reverse-string', 'word-count', 'scrabble-score', 'bob'],
  arrays: ['flatten-array', 'transpose', 'matrix', 'saddle-points', 'series'],
  'binary-search': ['binary-search'],
  'dynamic-programming': ['change', 'knapsack', 'book-store'],
  stacks: ['matching-brackets'],
  'number-theory': ['armstrong-numbers', 'collatz-conjecture', 'difference-of-squares', 'grains', 'leap', 'nth-prime', 'perfect-numbers', 'prime-factors', 'sieve', 'sum-of-multiples'],
  'encoding-and-parsing': ['all-your-base', 'atbash-cipher', 'luhn', 'phone-number', 'roman-numerals', 'rotational-cipher', 'run-length-encoding', 'secret-handshake'],
  'combinatorics': ['pascals-triangle', 'spiral-matrix', 'diamond', 'largest-series-product'],
  trees: ['satellite', 'sgf-parsing'],
  graphs: ['connect', 'word-search'],
  sorting: ['high-scores'],
  'maps-and-counting': ['etl', 'nucleotide-count', 'protein-translation', 'rna-transcription', 'yacht'],
};
const hard = new Set(['book-store', 'knapsack', 'change', 'sgf-parsing']);
const medium = new Set(['binary-search', 'flatten-array', 'transpose', 'matrix', 'saddle-points', 'series', 'all-your-base', 'run-length-encoding', 'spiral-matrix', 'diamond', 'largest-series-product', 'nth-prime', 'sieve', 'protein-translation', 'yacht']);
function flatten(cases) { return cases.flatMap(c => c.cases ? flatten(c.cases) : [c]).filter(c => !c.reimplements); }
const problems = Object.entries(selections).flatMap(([topic, slugs]) => slugs.map(slug => {
  const directory = path.join(root, 'exercises', slug);
  const canonical = JSON.parse(fs.readFileSync(path.join(directory, 'canonical-data.json'), 'utf8'), (_key, value, context) => {
    // Canonical Grains cases exceed 2^53. Preserve their exact decimal digits.
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      if (!context?.source) throw new Error('This import requires Node.js 22 with JSON source contexts.');
      return context.source;
    }
    return value;
  });
  const cases = flatten(canonical.cases);
  // A bounded, evenly spread sample includes first/last boundary cases and every operation.
  const selected = new Set([0, cases.length - 1]);
  const properties = [...new Set(cases.map(c => c.property))];
  for (const property of properties) selected.add(cases.findIndex(c => c.property === property));
  for (let i = 0; i < Math.min(16, cases.length); i++) selected.add(Math.round(i * (cases.length - 1) / Math.max(1, Math.min(16, cases.length) - 1)));
  const chosen = [...selected].sort((a,b) => a-b).map(index => cases[index]);
  const visibleUuids = new Set([...properties.map(property => cases.find(c => c.property === property).uuid), ...chosen.slice(0, 3).map(c => c.uuid)]);
  const title = slug.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  const instructionsFile = ['instructions.md', 'description.md'].find(file => fs.existsSync(path.join(directory, file)));
  if (!instructionsFile) throw new Error(`Missing instructions for ${slug}`);
  const introduction = path.join(directory, 'introduction.md');
  const instructions = (fs.existsSync(introduction) ? fs.readFileSync(introduction, 'utf8') + '\n\n' : '') + fs.readFileSync(path.join(directory, instructionsFile), 'utf8');
  return {
    slug, title, topic, difficulty: hard.has(slug) ? 'hard' : medium.has(slug) || ['trees', 'graphs'].includes(topic) ? 'medium' : 'easy',
    prompt: instructions + (canonical.comments?.length ? '\n\n## Source conventions\n' + canonical.comments.join('\n') : ''),
    operations: properties,
    sourceUrl: `https://github.com/exercism/problem-specifications/tree/${revision}/exercises/${slug}`,
    testCases: chosen.map(c => ({ input: JSON.stringify({ operation: c.property, input: c.input }), expectedOutput: JSON.stringify(c.expected), hidden: !visibleUuids.has(c.uuid), description: c.description, uuid: c.uuid })),
  };
}));
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/coding-library.json', JSON.stringify({ revision, source: 'Exercism', license: 'MIT', problems }, null, 2) + '\n');
fs.copyFileSync(path.join(root, 'LICENSE'), 'src/data/EXERCISM-LICENSE.txt');
console.log(`Imported ${problems.length} problems, ${problems.reduce((n,p) => n + p.testCases.length,0)} canonical cases; revision ${revision}`);
