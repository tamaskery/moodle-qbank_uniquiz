# UniQuiz 0.1.6 beta — QA summary

Verified 11 October 2026 (UTC). Plugin version `2026101100`, release `0.1.6`, maturity beta.

## Hosted candidate verification

[All four jobs passed](https://github.com/tamaskery/moodle-qbank_uniquiz/actions/runs/38126997472) on commit `0559a8cfa46932bb7ef2b7ddffeb502e169eaf76`. All four acceptance artifacts were downloaded and inspected. Subsequent handoff changes update documentation/evidence only; executable plugin files and test harnesses remain identical to this tested commit. The exact final archive commit/checksum is recorded separately in the submission kit's PACKAGE.json. Final PR-head checks are also linked in the PR handoff.

Tests used Ubuntu 24.04 (runner image ubuntu24/20261004.327), PHP 8.3.35, Node 22.23.3, Google Chrome and Boost. Database patch versions below come from container job logs. The harness did not emit Chrome's exact version; no exact browser-version claim is made.

| Moodle | Database | Integration | Chrome workflows | Adversarial HTTP | Translation checks | 500-question import |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 4.5.15 (Build: 20261005) | PostgreSQL 17.11 | 104/104 | 38/38 | 16/16 | 18/18 | 2.488 s |
| 5.2.4 (Build: 20261005) | PostgreSQL 17.11 | 104/104 | 38/38 | 16/16 | 18/18 | 1.968 s |
| 5.3 (Build: 20261005) | MariaDB 11.8.9 | 104/104 | 38/38 | 16/16 | 18/18 | 1.819 s |
| 5.3 (Build: 20261005) | PostgreSQL 17.11 | 104/104 | 38/38 | 16/16 | 18/18 | 1.954 s |

Every environment passed PHP syntax, coding standard, PHPdoc, plugin validation, savepoints, Mustache, full Grunt/frontend checks and exact generated-file consistency. PHPUnit passed 11 tests / 62 assertions; Chrome Behat passed 1 scenario / 9 steps. The generated-file job passed 134 engine regressions, 20 language/export invariance checks, all eight AMD modules/maps, and 508 sorted unique English keys. These local engine/language/map checks were also repeated during finalization.

## Grading corrections proved in real Moodle

All four integration reports contain eight passing new checks: tiny numerical tolerance import and exact stored value `0.00000001`; full credit accepted and partial-credit-only rejected for both Short Answer and Numerical; successful import of seven-decimal thirds; and rejection of a `99.999` total. The database equality assertion cannot pass merely because the tolerance was rounded to zero. Four focused engine regressions also exercise both browser validators, mixed full/partial credit, recovery and grading boundaries.

Run timestamps, per-job/acceptance durations, artifact IDs, report hashes and exact results are in submission/EVIDENCE.json. Measurements are runner observations, not production capacity guarantees.

## Earlier evidence and review scope

The [0.1.5 baseline](https://github.com/tamaskery/moodle-qbank_uniquiz/actions/runs/37691431917) tested commit `8f6aba4a2978e1c38c27f0a6ad7144ec3cc6f137`; its results are not represented as 0.1.6 results. Listing screenshots are explicitly retained as earlier 0.1.5 UI illustrations, with provenance in submission/screenshots/README.md.

The earlier low/medium robustness findings were assessed against 0.1.6 in the separate submission review. The tag limit is correctly 255 on all tested branches. The database mark bound, receipt eviction, unpaginated categories and category-marker numbering remain known limitations; the review recommends targeted follow-up and does not claim those have been fixed. SECURITY.md explains relevant residual risks and plain-text handling. This focused assessment does not extend the independent-review scope or certify all native display surfaces.

## What the acceptance tests verify

All six supported question types, preview/search, XML download, explicit import confirmation, native question-bank results, malformed-input recovery, session/token and destination checks, retry receipts, literal text and Unicode fidelity, safe error references, invalid control characters, batch boundaries, AIKEN repair and student access denial. A 390 × 844 mobile journey completes upload, review, XML download and confirmed import. Browser exception checks pass.

The adversarial suite runs only against disposable CI sites. It covers entity envelopes, malformed structure, authorization, receipt integrity and concurrent retries; a database check confirms that the concurrent identical requests create one question. The pseudolanguage suite exercises native language customization, literal hostile translations and unchanged exported data. These are targeted regression checks, not an independent security audit.

The 0.1.6 500-question measurements used 389,013 bytes of XML and a 30 MiB whole-process peak in these runners. They are observations, not production capacity guarantees.

## Remaining acceptance limits

- Stage-test installation and the upgrade from the installed beta on a backed-up copy of the intended production site. No production-copy staging acceptance was performed for this candidate.
- Marketplace account declarations, archive precheck, manual review and publication are separate maintainer steps. Passing repository CI is not Marketplace approval.
- Moodle 5.0/5.1, other PHP/database versions, arbitrary themes, full RTL, human translation quality and a complete accessibility audit remain unverified. Minimum installation requirements do not certify all later Moodle versions.
- Direct import is limited to 500 questions and 8 MiB XML, with additional field and structure caps. Source files are limited to 5 MB. See README.md.
- Session receipts do not provide durable exactly-once delivery. Inspect the destination bank after an interrupted import before starting a new batch.

Keep beta maturity and stage-test the exact deployment before production use.
