# UniQuiz 0.1.7 beta — QA summary

Plugin version 2026101101; release 0.1.7; beta maturity.

## Candidate verification

Hosted verification of the complete translated candidate is pending. Earlier failed development runs are not acceptance evidence. Local checks pass: 135 engine tests, 20 baseline language checks, complete 516-key translations in es/de/fr/hu with placeholder parity and byte-identical XML/AIKEN output, and eight AMD modules with matching source maps.

The expanded hosted matrix covers Moodle 4.5, 5.2 and 5.3 on PostgreSQL, and 5.3 on MariaDB. It checks native grade matching at the deliberate boundary, tiny tolerance text/value, mark bounds, independent late rollback, category pagination, retry budgets, receipt preservation, official language-pack selection and four translated browser journeys. Final results and exact environments will replace this pending section after artifact inspection.

## Baseline and remaining gates

The passing 0.1.6 evidence is preserved separately as submission/EVIDENCE-0.1.6.json. It is baseline evidence, not fresh 0.1.7 verification. Earlier 0.1.5 screenshots are illustrations until replaced with candidate captures.

No intended-production staging site was available. Backed-up staging installation/upgrade, native question display, theme/roles/import acceptance and the reported core question-count HTTP 500 investigation remain pending. Marketplace declarations, name availability, archive precheck, review and publication remain maintainer gates. No production deployment, merge or release tag was performed.

Automated translations checks verify wiring, escaping and invariant exported data. Native-speaker editorial review, complete RTL, arbitrary themes and a full accessibility audit are outside the executed scope.
