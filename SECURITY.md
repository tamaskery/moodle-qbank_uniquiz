# Security notes — UniQuiz 1.0 beta

Release 1.0 build `2026101201` carries forward the 0.1.7 conversion/import safeguards. Marketplace corrections add explicit Privacy API metadata links for core_question and core_log, source headers, English-only installation packaging and developer-debugging acceptance checks. This is not a new independent security audit; the dated review scope below remains historical evidence.

The original implementation review covered 0.1.2 on 6 October 2026. Subsequent functional and security regression results are recorded in QA.md; those do not turn the original review into an independent audit of each later release.

Original review scope: this plugin's PHP entry points, destination authorization, restricted XML validation, Moodle import/rollback, session retry receipts, generated browser code, language handling, data flow and release packaging. Tests ran only on isolated localhost Moodle 4.5.13 and 5.2.2 sites with PHP 8.3.33, PostgreSQL 16 and Boost/Edge.

This is an implementation-time code review with targeted adversarial tests, not an independent penetration test, certification or guarantee that no vulnerabilities exist. No critical/high-severity issue was identified in this scope. The following resource-abuse weakness was fixed; deployment-specific and residual risks remain.

## Finding fixed

**Authorized-user resource amplification (moderate, qualitative assessment; no CVSS claim).** The previous 500-question/8 MiB limits did not separately bound answers, tags or category markers. A user already allowed to add questions could construct a small question count with disproportionately many repeated items, causing excessive validation/core database work. This was not an anonymous authorization bypass.

0.1.2 adds independent caps: 100 answers and 100 tags per question; 5000 of each per batch; 500 category markers; 50000 XML elements; and 256 KiB per scalar field before HTML purification. A cheap pre-DOM guard caps raw markup starts at 100001, including comments/CDATA, to reject dense node floods before allocating the DOM. Existing 8 MiB/500-question caps remain. Requests exceeding these checks fail before core import. Limits were tested through PHPUnit and selected HTTP requests; normal 500-question imports still pass. They reduce per-request work but are not a site-wide rate limiter or a general denial-of-service guarantee.

**Additional hardening:** require UTF-8 and reject NUL/invalid UTF-8 before XML parsing, rejecting alternate declared encodings as well. Recheck the 8 MiB cap after HTML purification/XML serialization, since escaping CDATA can expand a smaller request; an expansion fixture verifies rejection before core import. The previous DTD checks already prevented the tested entity envelopes; this is defense in depth, not a claim of a confirmed prior XXE vulnerability.

During localization development, regression tests also caught and corrected accidental translation of internal severity codes and a Moodle initialization-size warning. These were fixed before this release. Language configuration now uses escaped page data; strings load before engine initialization. Hostile translations remain literal text/attributes rather than executable markup.

## Controls reviewed and tested

- Login, enabled-plugin and question-bank capability checks; authenticated POST and Moodle sesskey; destination fetched from the database and checked against both allowed contexts and its real `moodle/question:add` capability. No new capability granting or client-supplied context authority.
- Server-side allowlist for six question types and their fields/options; duplicate fields, namespaces, processing instructions, comments, embedded files, DTDs/entities and unsupported markup rejected. XML uses `LIBXML_NONET`, with external resolution and entity substitution disabled. Local-file and external parameter-entity envelopes are rejected before import.
- Plain-text source rendered with text nodes and escaped templates; Moodle `clean_text` purifies accepted HTML fields before the core XML importer. Tests cover script tags, event attributes, JavaScript URLs and SVG payloads, plus hostile browser content and translation values. No plugin `eval`, HTML insertion sink or external conversion endpoint was found in reviewed source.
- Receipt tokens are random, session-bound, context-bound, expire after 24 hours and have a capacity of 200 unexpired receipts. After a successful import, category/count/XML are bound by a hash: identical retries return the original result and changed content is rejected. Authorized attempts are bounded at 20 per token and 50 per session in ten minutes. Failed attempts count; successful identical replay bypasses the work budget. HTTP 429 provides Retry-After and recovery guidance. Context checks and cross-session rejection apply before import. Concurrent identical requests were checked against the real database and created exactly one question on each tested version.
- Atomic request-owned database transaction; an induced late core failure leaves no partial questions, entries, versions or answers. Temporary XML is request-scoped and removed after the import attempt, with Moodle request cleanup as fallback. File attachments are not accepted.
- Expected validation returns 422 without submitted content; unexpected import failures return 500 with a reference. Plugin log records exclude submitted content, exception messages, SQL and trace arguments. Moodle/web-server logging and debugging configuration are separate responsibilities.
- Source files stay in browser memory until generated XML is explicitly submitted to the same Moodle site. No plugin analytics, AI/conversion service, persistent draft/history or plugin database tables. Moodle retains normal questions and import events.
- Build dependencies are locked and excluded from the installable archive. The Moodle-compatible development toolchain includes older packages and npm advisory warnings; no zero-advisory claim is made for the 0.1.7 toolchain. Run builds on isolated CI/development environments. Moodle/PHP/OS dependency audits are outside scope.

See [QA.md](QA.md) for the current verification summary. No test credentials or test-site configuration are shipped.

## Deployment and residual risks

Use HTTPS, current supported Moodle/PHP security updates, appropriately restricted question-author roles, protected session storage, server/proxy upload and execution limits, backups and monitoring. Disable developer error display on production. Follow Moodle's [security policy](https://moodledev.io/general/development/policies/security) and [XSS guidance](https://moodledev.io/general/development/policies/security/crosssite-scripting). Stage-test the exact deployment and validate backup/restore before production use.

Session receipts are not durable exactly-once storage: a crash after database commit but before session persistence, session expiry/loss, or a new token can permit a second intentional import. On an unconfirmed result, inspect the question bank before starting again. Concurrent requests in one session wait on its lock. Multi-user floods, browser freezing on complex source files, administrator-installed language/theme/plugins, external event-observer side effects and infrastructure compromises are not eliminated by this plugin.

Live receipts are never silently evicted. Expired receipts are pruned; when 200 unexpired receipts exist, opening a new wizard fails with guidance while existing drafts and successful replays remain usable. This is bounded session storage, not durable deduplication. Retry counters survive fresh wizard tokens but can be bypassed with a separate session; they are not account-wide or site-wide rate limits.

Default marks are bounded to 0.0000001–10000 for graded questions and 0 for Description before native import, with matching browser checks. This rejects extreme marks with a safe 422 instead of relying on database overflow. Native postprocessing fault injection separately tests full rollback without invalid grades. The injectable formatter is a trusted PHP dependency used by tests; the HTTP endpoint never accepts a formatter or fault-control input.

Category search rechecks the current question-bank contexts, login, sesskey, enabled-plugin state and add-question capability. Queries escape wildcard characters and return at most 50 options per page, with bounded same-context ancestor traversal. The browser inserts labels as text and preserves the selected destination. Final import independently checks the destination again.

Direct forged XML can contain HTML that Moodle's purifier allows, including permitted links/resources. Such content is handled under the existing question-author capability; this plugin is not a remote-resource privacy firewall. Its normal converter exports plain text. Review question content and site filtering policies.

Question names and Short Answer accepted values can retain literal markup text from forged XML. They are plain-text data, not HTML-purified fields, and rely on Moodle core's escaping/filtering when displayed. Encoding Short Answer values would change matching, including literal answers such as `a<b`. Numerical answers must pass the finite-number grammar and True/False answers must be exactly `true` and `false`; arbitrary markup in those answer values is rejected. Include native display surfaces and the intended site's filters/theme in staging acceptance.

The environments listed at the top describe the original 0.1.2 review. Consult QA.md for the exact candidate checks, databases and browser results. Passing these tests is not a security certification or proof of deployment-specific safety. Custom themes, complete RTL behavior and production infrastructure need separate acceptance testing.

Report suspected plugin vulnerabilities through [private vulnerability reporting](https://github.com/tamaskery/moodle-qbank_uniquiz/security/advisories/new), with the version and a minimal synthetic reproduction. Do not include live student data, passwords or session cookies in public reports.
