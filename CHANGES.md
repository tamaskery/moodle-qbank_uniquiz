# 1.0 — 12 October 2026

- Set the public plugin release to 1.0 and increase Moodle's upgrade version to `2026101200`; beta maturity is retained.
- Update installation, upgrade, translation, security, QA and Marketplace preparation documentation for 1.0.
- Carry forward the 0.1.7 conversion engine, import safeguards and four bundled translations without runtime changes or plugin database migrations.
- Preserve previous release notes, test evidence and screenshot provenance under their original versions. Exact 1.0 CI and intended-site staging acceptance are separate checks.

# 0.1.7 — 11 October 2026

- Bound default marks to 0.0000001–10000 in both browser stages and direct import; Description remains 0.
- Round each positive XML grading percentage half-up to seven decimal places, then sum the scaled integers with an inclusive 0.0001 percentage-point allowance. This is a percentage policy, distinct from Moodle's stored seven-decimal proportions. Browser and PHPUnit consume one shared vector fixture; the repository's real-import harness checks thirds and sixths against explicit canonical stored fractions.
- Export numerical tolerances as plain decimals derived from the shortest round-trip representation.
- Limit authorized import work to 20 attempts per token and 50 per session in ten minutes, with HTTP 429, Retry-After and recovery guidance. Successful receipt replay remains available.
- Preserve all unexpired receipts, with expiry pruning and a clear capacity response at 200; opening tabs no longer silently invalidates older drafts or completed receipts.
- Search and paginate permitted destination categories in pages of 50, preserving selection and renewing confirmation after destination changes.
- Make XML diagnostics instance-local and report category-marker errors at document/category locations.
- Ship shared grading and receipt policy PHPUnit tests. Replace overflow-based rollback fixtures with trusted formatter failure after native questions have been created.
- Bundle complete Spanish, German, French and Hungarian translations of the wizard, AIKEN tool, guide, diagnostics and server messages.
- Introduce full-credit semantic keys: js_core_no_full_credit_short_answer, js_core_no_full_credit_numerical_answer, js_core_short_answer_requires_full_credit and js_core_numerical_requires_full_credit. The mark-range key is js_core_default_mark_range. Site-local translators should re-review these entries using the 0.1.6 migration map; old registry keys stay reserved.

# 0.1.6 — 11 October 2026

- Preserve numerical tolerance precision, including values smaller than 0.0000001.
- Require a 100% answer for Short Answer and Numerical in both browser validation stages, matching direct import.
- Align Multiple Choice grading-total tolerance with the server (0.0001).
- Retain existing diagnostic codes and translation identifiers; clarify the full-credit requirement.

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
