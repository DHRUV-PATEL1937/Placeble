# Coding library

The catalog serves 50 fixed exercises across 12 categories. Specifications and canonical tests are adapted from Exercism problem-specifications (MIT), pinned to commit `650bebeb39ad40439175288042aece982b0a90a9`. Attribution is in `src/data/EXERCISM-LICENSE.txt`; each exercise has a source URL in the bundled data. There are no runtime requests to generate questions.

`ensureCodingQuestionBank` idempotently upserts the bundled version on the first catalog request. Stable `exercism-library-<slug>` seed keys preserve MongoDB question IDs and submission history across future dataset updates. Existing generated questions and submissions are retained; questions attempted by the current student appear in Previous practice.

The stdin adapter receives `{ "operation": "name", "input": { ... } }` and prints a JSON result. Errors use the canonical `{ "error": "message" }` format. Integers beyond JavaScript's safe integer range are represented as exact decimal strings. Object keys and whitespace are ignored when comparing JSON; array order is preserved. The imported sample contains 569 canonical cases, spaced across the source cases, including boundaries and representatives of every operation. Each operation has a visible example.

Code execution uses the existing Judge0 / JavaScript / Python path and AI evaluation fallback. An AI verdict alone cannot pass a test: its reported output must match the stored expected output. No AI provider is contacted while browsing the library. Actual compiler availability still depends on deployment configuration.

`PUT /aptitude/coding/problems/:id/workspace` saves language-specific drafts under the authenticated student ID. Problem details return that student's workspace, their ten most recent submissions with code, and their latest accepted submission independently of the ten-entry window. The editor opens accepted code for solved questions, saved drafts for unsolved questions, or the latest submission if no draft exists.

## Verify

Run `npm run typecheck`, `npm run build`, and `npm run test:coding`. Integration tests use an ephemeral MongoDB database, never the production URI. On the first test run mongodb-memory-server downloads MongoDB and requires network access.

## Update the source snapshot

Clone `https://github.com/exercism/problem-specifications`, check out the intended revision, and run `node scripts/import-coding-library.mjs <checkout>`. The importer retains provenance, license, error cases, and exact large integers. Review the diff and run the integration tests before publishing a new snapshot.
