# UniQuiz 1.0 beta — QA summary

## Current release

Release `1.0`, Moodle upgrade version `2026101201`, maturity beta, prepared 12 October 2026. Marketplace corrections exclude non-English language files from the installation ZIP, add source copyright/licence boilerplate, declare core_question/core_log Privacy API metadata and enable explicit developer debugging during disposable acceptance. The CI workflow checks the actual `git archive` ZIP for English-only languages, source headers and development-directory exclusions. A new privacy PHPUnit test checks both subsystem declarations. Check the exact correction commit's Actions run before packaging. Historical results below are not tests of this corrected build.

## Historical 0.1.7 baseline

Verified 11 October 2026 (UTC). Plugin version `2026101102`, release `0.1.7`, maturity beta.

## Hosted 0.1.7 candidate verification

[All four jobs passed](https://github.com/tamaskery/moodle-qbank_uniquiz/actions/runs/38162869491) on commit `deeb6b82902498a936f6ca76e808163685f967a8`, build `2026101102`. All four acceptance artifacts were downloaded and inspected, including canonical stored fractions, native-language exports and report checksums. The native Grunt rebuild matches an immutable copy of the committed AMD files in every environment. Subsequent evidence updates are documentation only; PACKAGE.json in the submission kit records the final archive commit and its separate passing CI.

The matrix used Ubuntu 24.04, PHP 8.3.35, Node 22.23.3, headless Chrome 154.0.8037.97 and Boost. Exact database patch versions come from job logs.

| Moodle | Database | Integration | Browser | Adversarial HTTP | Four native languages | Pseudo translation | 500-question import |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 4.5.15 (Build: 20261005) | PostgreSQL 17.11 | 178/178 | 42/42 | 42/42 | 45/45 | 18/18 | 2.536 s |
| 5.2.4 (Build: 20261005) | PostgreSQL 17.11 | 178/178 | 42/42 | 42/42 | 45/45 | 18/18 | 1.273 s |
| 5.3 (Build: 20261005) | MariaDB 11.8.9 | 178/178 | 42/42 | 42/42 | 45/45 | 18/18 | 1.853 s |
| 5.3 (Build: 20261005) | PostgreSQL 17.11 | 178/178 | 42/42 | 42/42 | 45/45 | 18/18 | 2.638 s |

Every environment passed PHP syntax, coding standards and PHPdoc with zero warnings, plugin validation, savepoints, Mustache, full Grunt/frontend checks, generated-file consistency and post-native-Grunt AMD comparison, PHPUnit (17 tests / 138 assertions) and Chrome Behat (1 scenario / 9 steps). The build also passed 135 engine tests, 20 baseline language checks, complete 516-key es/de/fr/hu translations with placeholder and export invariance, 516 sorted English keys and eight AMD modules/source maps.

## What the new checks prove

Thirds expressed as XML percentages to four, five and seven decimal places, sixths and the inclusive grading boundary pass native Moodle grade matching. The harness reads each stored answer back from the database and checks its order and canonical proportion against explicit fixture expectations: thirds `0.3333333`, sixths `0.1666667`, and values near 50% `0.5000000`. EVIDENCE.json retains the input XML percentages, expected proportions and raw stored text for every marked vector. A 99.999 total and out-of-bound totals are rejected before import. The same vector fixture is consumed by JS and shipped PHPUnit. The [repository harness guide](https://github.com/tamaskery/moodle-qbank_uniquiz/blob/3c87c7e3144251dff314d80c797144178ecec67f/.build/qa/README.md) describes the real-import consumer and CI reproduction; development harnesses are excluded from installation. Both browser stages and the server enforce mark bounds 0.0000001–10000 and require full-credit Short Answer/Numerical answers.

The exported tiny tolerance is exactly `0.00000001`. Database-returned text is recorded separately in EVIDENCE.json; PostgreSQL may return `1.0E-8`, while the strict numeric equality proves preservation of the value. This does not claim uniform edit-form formatting. Export uses shortest round-trip decimal expansion, avoiding fixed-decimal precision loss.

Independent failure after native question creation/postprocessing rolls back the whole batch; the HTTP test checks the safe incident response. Receipt tests cover temporary budgets, Retry-After, expiry/capacity, drafts and completed retries surviving more than fifty new tabs, and exactly one question from concurrent identical submissions. Category tests cover bounded pages, literal wildcard search, preserved selection, confirmation reset and authorization.

Official Moodle language packs are installed for Spanish, German, French and Hungarian. Each language completes wizard review, identical XML export, confirmed import with its translated response, a full-credit diagnostic, AIKEN repair with unchanged syntax, guide rendering and mobile overflow checks. Pseudo-language checks exercise malicious customized strings and escaping. These checks verify functionality and translation wiring; they do not constitute native-speaker editorial review or a full accessibility audit.

Run timestamps, job/acceptance durations, artifact IDs, hashes, raw tolerance text and benchmark measurements are in submission/EVIDENCE.json. The 500-question timings and 30 MiB process peaks are runner observations, not production capacity guarantees.

## Baseline and remaining gates

The passing 0.1.6 evidence remains separately in submission/EVIDENCE-0.1.6.json as historical baseline. Listing screenshots are retained earlier 0.1.7 build `2026101101` English desktop captures from Moodle 5.3/PostgreSQL and four-language mobile captures from Moodle 4.5.15/PostgreSQL, with provenance in submission/screenshots/README.md. Both screenshot artifacts belong to the earlier passing run `38148673556`; they illustrate the UI and are not new-build acceptance evidence. REVIEW-0.1.7.md maps the reviewer findings to the implemented changes and residual scope.

No intended-production staging site was available for the historical baseline. Backed-up staging installation/upgrade, native question display, theme/roles/import acceptance and the reported core question-count HTTP 500 investigation remain pending for 1.0. Marketplace declarations, name availability, archive precheck, review and publication remain maintainer gates.

## Current privacy and debugging checks

The plugin does not own persistent tables or user preferences. Its metadata provider describes core_question (questions and author ownership) and core_log (user/context import events). Core owns privacy export/deletion. Temporary session receipts are time-limited, not exported as plugin-owned persistent data; see Moodle's Privacy API FAQ. Disposable acceptance sets DEBUG_DEVELOPER with visible diagnostics and asserts that configuration before running real imports/browser checks. Non-English development tests remain useful but do not imply translations ship in the Marketplace ZIP.
