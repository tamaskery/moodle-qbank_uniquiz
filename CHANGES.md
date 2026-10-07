# 0.1.5 — 7 October 2026

- Replace generated hash-suffixed translation keys with an explicit stable registry and publish a migration map for 0.1.4 translations.
- Add complete validator parameter documentation and renderable Mustache example contexts.
- Format generated JavaScript/CSS consistently with Moodle's rules and extract focused validation helpers.
- Make frontend lint, source-map integrity, engine regressions and language/export invariance required build checks.
- Match Moodle's locked AMD compiler and Grunt serialization exactly.
- Verify hosted Moodle Plugin CI, PHPUnit, Behat and real import/browser/security suites on Moodle 4.5, 5.2 and 5.3, including MariaDB and a full mobile import journey.
- Publish source, issue tracking, private vulnerability reporting and a separate Marketplace submission kit.

# 0.1.4 — 7 October 2026

- Assign a distinct Moodle upgrade version (2026100701) to the reviewed 0.1.3 respin; the conversion/import implementation is unchanged.
- Ship a concise QA summary and retain site-specific incident details only in the source repository.
- Verify the upgrade and real integration harness on Moodle 5.3 (build 20261005).

# 0.1.3 — 7 October 2026

- Display Moodle's native AJAX error text for expired tokens, invalid sessions and unauthorized destinations, with retry available.
- Sort all 508 English language keys together and check uniqueness/order during language QA.
- Rerun real Moodle 4.5/5.2 integration and Chrome workflow checks; document the separate Moodle core question-count incident.
- Invalidate AIKEN results and downloads when a different file is selected or source text changes.
- Clear unknown-column warnings once manual mapping assigns those columns a role, while retaining warnings for ignored columns.
- Use pre-import wording in the review summary and singular labels for one-question AIKEN and direct-import flows.

# 0.1.2 — 6 October 2026

- Make the wizard, mapping/settings/preview, diagnostics, AIKEN fixer, guide and accessibility labels translatable through Moodle; include English fallback and translator instructions.
- Load native language strings before browser modules; use escaped configuration, template attributes and literal text substitution. Preserve source/export data and internal validation codes across languages.
- Add separate answer/tag/category/XML complexity and text-field limits; reject alternate XML encodings before import and dense markup before DOM allocation.
- Add adversarial HTTP, malicious-translation, XML/HTML purification, concurrency and language-invariance tests, plus a scoped security report.
- Keep the existing import workflow, atomic rollback, session receipts and Moodle 4.5/5.2 beta support. Moodle 5.3 remains unverified.

# 0.1.1 — 6 October 2026

- Preserve literal comparisons, ampersands and multiline text in Moodle HTML fields without changing Short Answer accepted values.
- Reject unsupported XML characters during analysis; validate tag cleaning and question-name lengths before export.
- Add server validation locations, HTTP 422/500 distinctions and content-free incident references in server logs.
- Limit direct import to 500 questions, check limits in the browser, and request additional time/memory through Moodle helpers.
- Keep atomic nested-transaction rollback, now also covered by conventional PHPUnit tests.
- Localize PHP labels and import messages, sort destination hierarchies together, and inherit the site font.
- Include AMD source maps, PHPUnit/Behat tests and a packaged QA summary; add repository CI configuration.
- Remove the misleading inclusive compatibility range; only Moodle 4.5 and 5.2 are verified.

# 0.1.0 — 5 October 2026

- Initial beta for Moodle 4.5 LTS and 5.2.
- Question-bank wizard powered by the existing UniQuiz 0.7.0 engine.
- Explicit category selection, confirmed direct import and XML download.
- Server validation, destination authorization, batch transactions and session retry receipts.
- Separate AIKEN repair tab and an in-Moodle guide.
