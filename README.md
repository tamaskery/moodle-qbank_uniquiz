# UniQuiz for Moodle — qbank_uniquiz 0.1.4 beta

A native question-bank preparation wizard using the UniQuiz 0.7.0 browser engine. Select CSV/TXT, map columns, analyse, choose settings, search and review the full bank, then download Moodle XML or explicitly confirm direct import. Includes the AIKEN fixer as a separate tab.

## Install

Install `qbank_uniquiz-0.1.4.zip` using **Site administration → Plugins → Install plugins**, or copy the `uniquiz` folder into `question/bank/uniquiz`. For Moodle 5.2 and 5.3 this is under the `public` directory. Complete the Moodle upgrade process. When upgrading an existing installation, replace its plugin files and run Moodle's upgrade; no plugin database migration is needed.

Open a question bank and select **UniQuiz** from its action menu. The plugin uses Moodle's existing `moodle/question:add` capability in the destination context; no additional role grants are required for users who can already import questions. The built-in Moodle XML format (`qformat_xml`) must be available. Enable UniQuiz in the question-bank plugin administration if necessary.

This beta retains the tested 0.1.3 conversion/import implementation and has a new Moodle upgrade version. See the included [QA summary](QA.md) for exact tested versions, results and limits. Test upgrades on your staging site before production use. The optional inclusive `supported` range is deliberately omitted: `[405, 502]` would misleadingly include untested branches. The minimum installation version remains 4.5; this is not a guarantee for every later release. The wizard, guide, AIKEN fixer, diagnostics and server messages use Moodle language strings. English is included as the fallback; additional human translations are not bundled. See [TRANSLATING.md](TRANSLATING.md) for language customization and placeholders. Unicode question content is supported and is never translated automatically.

## Import behavior

- Supported types: Multiple Choice, True/False, Short Answer, basic Numerical, Essay, Description.
- Basic CSV, Advanced CSV, structured TXT, manual column mapping, source-numbering control, metadata, scoring, feedback, tags, search, filters and paginated preview reuse the existing engine.
- The direct import destination is explicit. All questions go into that selected existing category. Source category paths are ignored during direct import and retained in downloaded XML. Existing questions are never overwritten.
- Source files stay in browser memory. Only generated XML is submitted, and only after confirmation.
- Input limit: 5 MB. Direct import: at most **500 questions** and 8 MB generated XML, also constrained by PHP/web-server request limits. Larger valid banks can still be downloaded as XML. The importer requests 120 seconds and Moodle's extra memory allowance; proxy limits and server capacity still apply. There is no background job or automatic chunking.
- Direct import also caps answers and tags separately at 100 each per question and 5000 each per batch; category markers at 500; XML elements at 50000; and scalar text fields at 256 KiB. A pre-parse guard rejects more than 100001 raw `<` characters, including in comments/CDATA. UTF-8 XML is required. The 8 MiB limit is checked again after HTML purification/XML serialization. These are server-side protections; a too-complex batch is rejected with a translated validation message, without partial import. XML download remains available.
- Source question text, Multiple Choice answers and feedback are **plain text**, not raw HTML. Literal angle brackets and ampersands are preserved; line breaks become HTML breaks for display. Short Answer accepted values and Numerical values remain literal. There is no raw-HTML mode in this beta.
- Invalid XML control characters and unpaired Unicode surrogates are rejected during initial analysis with their code point and line. They are not silently deleted or replaced. Correct the source and analyse again. Settings are checked too; tag names must survive Moodle's tag cleaning unchanged and be at most 255 characters. Question names are limited to 255 characters.
- The server revalidates supported XML structure and grading, sanitizes HTML, checks destination permissions, rejects embedded files/entities, and uses Moodle's XML importer.
- An outer database transaction covers the entire batch. A failed import rolls back the batch's database changes; the plugin accepts no file attachments.
- A successful request's token and hash are recorded in the Moodle session so retrying that same request returns the original result. This is not content deduplication: deliberately importing a new batch with the same content creates new questions. Receipts expire after 24 hours or session loss and are capped at 50 per session. If the server connection is interrupted around commit/session saving, check the bank before starting another import.
- Moodle retains the session lock for the complete import to serialize retries. Other requests in the same user's session may wait until it finishes.
- Server validation failures return HTTP 422 and identify the question and structural field when available. Unexpected importer failures return HTTP 500 with an incident reference. Administrators can match that reference in the PHP/server error log. The plugin's diagnostic payload contains exception class, code, source file/line and up to six call locations, not exception messages, submitted questions, SQL, trace arguments or user identifiers. The server may add its usual log metadata separately.
- AIKEN repair produces a downloadable AIKEN file. It does not directly import from its separate tab; a corrected file can be selected in the converter or Moodle's AIKEN importer.

## Data and privacy

There are no plugin tables, external APIs, analytics or conversion histories. Created questions and standard import events belong to Moodle core. Temporary session receipts store context parameters, hashes, counts and result URLs but no question content. Submitted XML is written to a Moodle request temporary directory for the core importer and removed in a finally block; Moodle's request cleanup is the fallback after process interruption.

The standalone website's “no network connections” policy does not apply to the integrated page: Moodle needs its normal scripts and the confirmed import makes a same-origin request. No third-party conversion service is used.

## Development and licence

GNU GPL v3 or later; see `COPYING.txt`. This licence covers this plugin and the UniQuiz code bundled here, with the author's authorization. It does not change the licence of the separate standalone repository. No artwork or third-party runtime libraries are bundled.

The `amd/src` and `amd/build` modules, wizard templates, namespaced styles, and example CSVs are generated from the shared standalone source by the repository's `moodle-plugin/build-tools/build.mjs`. Version 0.1.1 fixes text fidelity and validation in that shared source, so both builds benefit. `ENGINE-SOURCES.json` records exact source hashes; source maps are bundled. Build tooling is in the source repository, not the installable ZIP. From `moodle-plugin/build-tools`, run `npm ci` followed by `npm run build`. Development dependencies are excluded from the ZIP. Moodle administrators do not need Node.js.

Run the repository's `npm test`, plugin browser tests and real-Moodle integration harness before releases. The ZIP includes conventional PHPUnit tests and a Behat navigation scenario; see [QA.md](QA.md) for executed checks and remaining release gates. The plugin inherits the site font but keeps a scoped light wizard palette; arbitrary themes and dark mode are not certified.

See [SECURITY.md](SECURITY.md) for this release's scoped security review, safeguards and deployment limitations. This beta is not security-certified; stage-test it and keep Moodle, PHP and the server patched.
