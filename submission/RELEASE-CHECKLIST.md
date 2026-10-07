# Maintainer submission checklist

## Prepared in this repository

- Public Moodle-style repository: `tamaskery/moodle-qbank_uniquiz`; Issues enabled.
- Unique component declared consistently as `qbank_uniquiz`.
- Candidate 0.1.5 beta, upgrade version `2026100702`.
- GPL v3-or-later licence, installation and privacy documentation.
- Stable language identifiers and a mapping for earlier beta customizations.
- Hosted PHP, template, frontend, PHPUnit and Behat checks.
- Disposable real-Moodle import, browser, adversarial and translation checks.
- Listing copy in LISTING.md; source and issue links supplied.
- Git archive rules exclude development dependencies, CI fixtures and submission materials.

## Before uploading

1. Confirm the exact packaged commit has passing required checks. Use QA.md and the linked CI evidence, not results from an earlier beta.
2. Stage-test installation and upgrade on a backed-up copy of the intended site. Inspect the question bank after import, and exercise the site's theme and roles.
3. Review the current Marketplace provider terms and account-visible submission guidelines. Complete the provider profile and ownership declarations yourself.
4. Verify the component name is available in the submission form. Repository naming does not reserve a Marketplace name.
5. Upload the ZIP, select only tested Moodle branches, add the listing text and screenshots, and retain beta maturity.
6. Resolve any Marketplace archive-validation feedback, then submit for manual review. Publication follows approval and is a separate maintainer action.

Do not submit development archives, synthetic credentials, CI server logs or a production backup. Do not claim a security certification, universal theme compatibility or production capacity guarantees.

## Reproducible release archive

From a clean, verified commit at the repository root:

```sh
git archive --format=zip --prefix=uniquiz/ -o ../dist/qbank_uniquiz-0.1.5.zip HEAD
```

The ZIP must contain one `uniquiz` directory with `version.php`, matching source/build files and bundled user documentation. Inspect its entries and checksum before uploading. Development build instructions are in CONTRIBUTING.md.
