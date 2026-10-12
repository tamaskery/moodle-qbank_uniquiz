# Maintainer submission checklist

## Prepared in this repository

- Public Moodle-style repository: `tamaskery/moodle-qbank_uniquiz`; Issues enabled.
- Unique component declared consistently as `qbank_uniquiz`.
- Candidate 1.0 beta, upgrade version `2026101201`; conversion/import behavior retained; Marketplace/privacy corrections applied.
- GPL v3-or-later licence, installation and privacy documentation.
- English-only installable language files, stable identifiers and semantic migration maps; four non-English development sources retained for AMOS after approval.
- Hosted PHP, template, frontend, PHPUnit and Behat checks.
- Disposable real-Moodle import, browser, adversarial and translation checks.
- Historical 0.1.7 build 2026101102 artifacts inspected in all four environments, including stored canonical fractions and immutable post-Grunt AMD comparison; actual versions, timings, tested commit and report hashes recorded in EVIDENCE.json. Exact 1.0 package CI must be checked separately.
- Earlier reviewer findings assessed in REVIEW-0.1.7.md; the implemented robustness fixes and retained staging limits are described there.
- Earlier 0.1.7 build 2026101101 English and four-language UI illustrations retained with explicit CI provenance.
- Listing copy in LISTING.md; source and issue links supplied.
- Git archive rules exclude development dependencies, CI fixtures and submission materials.

## Before uploading

1. Confirm the exact 1.0 packaged commit has passing required checks. Use QA.md and the linked CI evidence, not results from an earlier beta. Record its commit, CI run and archive checksum together; the historical 0.1.7 evidence and archive checksum do not describe the 1.0 package.
2. Stage-test installation and upgrade on a backed-up copy of the intended site. Inspect the question bank after import, and exercise the site's theme and roles. Investigate the previously reported core question-count HTTP 500 there. No staging access was available during candidate finalization; these checks remain pending.
3. Review the current Marketplace provider terms and account-visible submission guidelines. Complete the provider profile and ownership declarations yourself.
4. Verify the component name is available in the submission form. Repository naming does not reserve a Marketplace name.
5. Upload the ZIP, select only tested Moodle branches, add the listing text and screenshots, and retain beta maturity.
6. Resolve any Marketplace archive-validation feedback, then submit for manual review. Publication follows approval and is a separate maintainer action.

Do not submit development archives, synthetic credentials, CI server logs or a production backup. Do not claim a security certification, universal theme compatibility or production capacity guarantees.

## Reproducible release archive

From a clean, verified commit at the repository root:

```sh
git archive --format=zip --prefix=uniquiz/ -o ../dist/qbank_uniquiz-1.0.zip HEAD
```

The ZIP must contain one `uniquiz` directory with `version.php`, matching source/build files and bundled user documentation. Inspect its entries and checksum before uploading. Development build instructions are in CONTRIBUTING.md.

## Guidelines correction gates

- Verify actual ZIP excludes lang/de, lang/es, lang/fr and lang/hu.
- Verify generated source copyright/licence/GPL headers and native AMD compiler consistency.
- Verify Privacy API declares core_question and core_log and passes the privacy regression test.
- Acceptance runs with developer debugging and visible diagnostics.
- Maintainer reported the earlier 1.0 upgrade worked; that report does not verify this new build.
- Account ownership/licence declarations, Marketplace name availability and upload validation still require maintainer completion.
