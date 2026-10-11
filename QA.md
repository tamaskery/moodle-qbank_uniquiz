# UniQuiz 0.1.7 beta — QA summary

Verified 11 October 2026 (UTC). Plugin version `2026101101`, release `0.1.7`, maturity beta.

## Hosted candidate verification

[All four jobs passed](https://github.com/tamaskery/moodle-qbank_uniquiz/actions/runs/38148673556) on commit `c0e189f81bd6296ddbaa1168848114165f4dbc9d`. All four acceptance artifacts were downloaded and inspected, including native-language exports and report checksums. Subsequent evidence and screenshot changes are documentation only. The final archive commit and its separate passing CI are recorded in PACKAGE.json in the submission kit.

The matrix used Ubuntu 24.04, PHP 8.3.35, Node 22.23.3, headless Chrome 154.0.8037.97 and Boost. Exact database patch versions come from job logs.

| Moodle | Database | Integration | Browser | Adversarial HTTP | Four native languages | Pseudo translation | 500-question import |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4.5.15 (Build: 20261005) | PostgreSQL 17.11 | 123/123 | 42/42 | 42/42 | 45/45 | 18/18 | 2.504 s |
| 5.2.4 (Build: 20261005) | PostgreSQL 17.11 | 123/123 | 42/42 | 42/42 | 45/45 | 18/18 | 2.647 s |
| 5.3 (Build: 20261005) | MariaDB 11.8.9 | 123/123 | 42/42 | 42/42 | 45/45 | 18/18 | 1.833 s |
| 5.3 (Build: 20261005) | PostgreSQL 17.11 | 123/123 | 42/42 | 42/42 | 45/45 | 18/18 | 2.814 s |

Every environment passed PHP syntax, coding standards and PHPdoc with zero warnings, plugin validation, savepoints, Mustache, full Grunt/frontend checks, generated-file consistency, PHPUnit (17 tests / 138 assertions) and Chrome Behat (1 scenario / 9 steps). The build also passed 135 engine tests, 20 baseline language checks, complete 516-key es/de/fr/hu translations with placeholder and export invariance, 516 sorted English keys and eight AMD modules/source maps.

## What the new checks prove

Four-, five- and seven-decimal thirds, sixths and the inclusive grading boundary pass native Moodle grade matching. A 99.999 total and out-of-bound totals are rejected before import. The same vector fixture is consumed by JS and shipped PHPUnit. Both browser stages and the server enforce mark bounds 0.0000001–10000 and require full-credit Short Answer/Numerical answers.

The exported tiny tolerance is exactly `0.00000001`. Database-returned text is recorded separately in EVIDENCE.json; PostgreSQL may return `1.0E-8`, while the strict numeric equality proves preservation of the value. This does not claim uniform edit-form formatting. Export uses shortest round-trip decimal expansion, avoiding fixed-decimal precision loss.

Independent failure after native question creation/postprocessing rolls back the whole batch; the HTTP test checks the safe incident response. Receipt tests cover temporary budgets, Retry-After, expiry/capacity, drafts and completed retries surviving more than fifty new tabs, and exactly one question from concurrent identical submissions. Category tests cover bounded pages, literal wildcard search, preserved selection, confirmation reset and authorization.

Official Moodle language packs are installed for Spanish, German, French and Hungarian. Each language completes wizard review, identical XML export, confirmed import with its translated response, a full-credit diagnostic, AIKEN repair with unchanged syntax, guide rendering and mobile overflow checks. Pseudo-language checks exercise malicious customized strings and escaping. These checks verify functionality and translation wiring; they do not constitute native-speaker editorial review or a full accessibility audit.

Run timestamps, job/acceptance durations, artifact IDs, hashes, raw tolerance text and benchmark measurements are in submission/EVIDENCE.json. The 500-question timings and 30 MiB process peaks are runner observations, not production capacity guarantees.

## Baseline and remaining gates

The passing 0.1.6 evidence remains separately in submission/EVIDENCE-0.1.6.json as historical baseline. Listing screenshots are fresh 0.1.7 English desktop captures from Moodle 5.3/PostgreSQL and four-language mobile captures from Moodle 4.5.15/PostgreSQL, with provenance in submission/screenshots/README.md. Both artifacts belong to the same passing run. REVIEW-0.1.7.md maps the reviewer findings to the implemented changes and residual scope.

No intended-production staging site was available. Backed-up staging installation/upgrade, native question display, theme/roles/import acceptance and the reported core question-count HTTP 500 investigation remain pending. Marketplace declarations, name availability, archive precheck, review and publication remain maintainer gates. No production deployment, merge or release tag was performed.
