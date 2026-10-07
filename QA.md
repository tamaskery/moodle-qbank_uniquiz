# UniQuiz 0.1.4 beta — QA summary

Checked 7 October 2026. Moodle plugin version `2026100701`, release `0.1.4`, maturity beta. This release gives the reviewed 0.1.3 respin a distinct upgrade number and trims the packaged documentation; conversion and import behavior are unchanged.

## Tested environments and results

The unchanged implementation was tested on Moodle 4.5.13 and 5.2.2 (build 20260810), PHP 8.3.33, PostgreSQL 16.14, Boost and Google Chrome. The following baseline results were obtained on the reviewed 0.1.3 respin, not rerun for the metadata/documentation-only change.

| Check | Result |
| --- | --- |
| Real Moodle integration, permissions, rollback and batch limits | 96 checks passed on each version |
| Chrome workflows, downloads, import, mobile and AJAX error recovery | 36 checks passed on each version |
| Moodle PHPUnit | 11 tests / 62 assertions passed on each version |
| Shared JavaScript regressions | 143 passed |
| PHP syntax and Moodle CodeSniffer | All 15 PHP files passed, no warnings |
| Language invariance/interpolation | 20 passed; 508 unique, sorted English keys |
| AMD/source-map integrity | All 8 modules passed |

Coverage includes all six supported question types, literal text and Unicode fidelity, destination authorization, expired-token/session errors, recovery, confirmed import, retry receipts and rollback after a late failure. Local 500-question CLI imports completed in 1.829 seconds on Moodle 4.5 and 2.384 seconds on 5.2, with whole-process peaks of 69 and 71 MiB. These are local measurements, not production capacity guarantees.

## Moodle 5.3 verification for 0.1.4

Moodle 5.3 (build 20261005), PHP 8.3.33, PostgreSQL 17, Boost and Google Chrome were tested with this release. Moodle detected and completed the upgrade from plugin version 2026100700 to 2026100701. All 96 integration checks and 36 Chrome workflow checks passed, including permissions, all six question types, text fidelity, rollback, boundary limits, downloads, mobile and AJAX error recovery. The 500-question import took 2.253 seconds with a 69 MiB whole-process memory peak. PHPUnit was not rerun on 5.3 for this release.

## Known limits

- Direct import is limited to 500 questions and 8 MiB XML, with additional field/structure limits. The source input limit is 5 MB. See README.md for exact behavior.
- Compatibility applies only to the exact environments tested. Moodle 5.0/5.1, other databases, PHP versions and custom themes are unverified. Minimum installation requirements do not certify every later Moodle version.
- Hosted CI, Behat execution, full frontend lint and staging acceptance remain outstanding stable-release gates. This is a beta, not Plugins Directory approval or a security certification.
- The complete standalone converter browser suite was not rerun. Targeted browser coverage is described above.
- Human translations, locale grammar, full RTL and dark/custom themes need further testing. Stable semantic translation identifiers are planned before 1.0; see TRANSLATING.md.
- Session receipts are not durable exactly-once guarantees. After an interrupted import, inspect the destination bank before retrying a new batch. Same-session requests may wait during import.

Test this beta on a staging copy of your site before production installation.
