# UniQuiz 0.1.5 beta — QA summary

Verified 7 October 2026 (UTC). Plugin version `2026100702`, release `0.1.5`, maturity beta. This candidate adds stable translation identifiers, generated-code formatting and Moodle-compatible build output. It is not a respin of 0.1.4.

## Candidate verification

[Hosted verification](https://github.com/tamaskery/moodle-qbank_uniquiz/actions/runs/37691431917) passed on commit `8f6aba4a2978e1c38c27f0a6ad7144ec3cc6f137`. Subsequent submission documentation and screenshots do not change executable plugin files. Tests used Ubuntu 24.04, PHP 8.3.35, Google Chrome and Moodle's Boost theme.

| Moodle | Database | Integration | Chrome workflows | Adversarial HTTP | Translation checks | 500-question import |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 4.5.15, build 20261005 | PostgreSQL 17 | 96/96 | 38/38 | 16/16 | 18/18 | 2.449 s |
| 5.2.4, build 20261005 | PostgreSQL 17 | 96/96 | 38/38 | 16/16 | 18/18 | 1.974 s |
| 5.3, build 20261005 | PostgreSQL 17 | 96/96 | 38/38 | 16/16 | 18/18 | 2.638 s |
| 5.3, build 20261005 | MariaDB 11 | 96/96 | 38/38 | 16/16 | 18/18 | 1.860 s |

Every environment also passed:

- Moodle Plugin CI PHP syntax, coding standard, PHPdoc, plugin validation, savepoints, Mustache and full Grunt checks, including exact generated-asset parity.
- PHPUnit: 11 tests, 62 assertions, including late-failure rollback and log redaction.
- Chrome Behat: 1 scenario, 9 steps.
- 130 plugin engine regressions; 20 language/export invariance checks; all eight AMD source maps; 508 unique, alphabetically sorted English keys and complete translation-key migration mapping.

The 130 engine tests exclude 13 standalone marketing-site tests from the earlier 143-test suite. They are not plugin workflows. The complete standalone site's browser suite is outside this candidate's scope.

## What the acceptance tests verify

All six supported question types, preview/search, XML download, explicit import confirmation, native question-bank results, malformed-input recovery, session/token and destination checks, retry receipts, literal text and Unicode fidelity, safe error references, invalid control characters, batch boundaries, AIKEN repair and student access denial. A 390 × 844 mobile journey completes upload, review, XML download and confirmed import. Browser exception checks pass.

The adversarial suite runs only against disposable CI sites. It covers entity envelopes, malformed structure, authorization, receipt integrity and concurrent retries; a database check confirms that the concurrent identical requests create one question. The pseudolanguage suite exercises native language customization, literal hostile translations and unchanged exported data. These are targeted regression checks, not an independent security audit.

The 500-question measurements used 389,013 bytes of XML and a 30 MiB whole-process peak in these runners. They are observations, not production capacity guarantees.

## Remaining acceptance limits

- Stage-test installation and the upgrade from the installed beta on a backed-up copy of the intended production site. No production-copy staging acceptance was performed for this candidate.
- Marketplace account declarations, archive precheck, manual review and publication are separate maintainer steps. Passing repository CI is not Marketplace approval.
- Moodle 5.0/5.1, other PHP/database versions, arbitrary themes, full RTL, human translation quality and a complete accessibility audit remain unverified. Minimum installation requirements do not certify all later Moodle versions.
- Direct import is limited to 500 questions and 8 MiB XML, with additional field and structure caps. Source files are limited to 5 MB. See README.md.
- Session receipts do not provide durable exactly-once delivery. Inspect the destination bank after an interrupted import before starting a new batch.

Keep beta maturity and stage-test the exact deployment before production use.
