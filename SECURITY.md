# Security review — UniQuiz 0.1.2 beta

Review date: 6 October 2026. Scope: this plugin's PHP entry points, destination authorization, restricted XML validation, Moodle import/rollback, session retry receipts, generated browser code, language handling, data flow and release packaging. Tests ran only on isolated localhost Moodle 4.5.13 and 5.2.2 sites with PHP 8.3.33, PostgreSQL 16 and Boost/Edge.

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
- Receipt tokens are random, session-bound, context-bound, expire after 24 hours and are capped at 50. Category/count/XML are hashed. Identical retries return the original result; changed content/context and cross-session tokens are rejected. Concurrent identical requests were checked against the real database and created exactly one question on each tested version.
- Atomic request-owned database transaction; an induced late core failure leaves no partial questions, entries, versions or answers. Temporary XML is request-scoped and removed after the import attempt, with Moodle request cleanup as fallback. File attachments are not accepted.
- Expected validation returns 422 without submitted content; unexpected import failures return 500 with a reference. Plugin log records exclude submitted content, exception messages, SQL and trace arguments. Moodle/web-server logging and debugging configuration are separate responsibilities.
- Source files stay in browser memory until generated XML is explicitly submitted to the same Moodle site. No plugin analytics, AI/conversion service, persistent draft/history or plugin database tables. Moodle retains normal questions and import events.
- Locked build dependencies: npm audit reported zero known advisories at review time. Those dependencies are not shipped as runtime packages. This is an advisory-database check, not source-level assurance of every dependency. Moodle/PHP/OS dependency audits are outside scope.

See [QA.md](QA.md) for the current verification summary. No test credentials or test-site configuration are shipped.

## Deployment and residual risks

Use HTTPS, current supported Moodle/PHP security updates, appropriately restricted question-author roles, protected session storage, server/proxy upload and execution limits, backups and monitoring. Disable developer error display on production. Follow Moodle's [security policy](https://moodledev.io/general/development/policies/security) and [XSS guidance](https://moodledev.io/general/development/policies/security/crosssite-scripting). Stage-test the exact deployment and validate backup/restore before production use.

Session receipts are not durable exactly-once storage: a crash after database commit but before session persistence, session expiry/loss, or a new token can permit a second intentional import. On an unconfirmed result, inspect the question bank before starting again. Concurrent requests in one session wait on its lock. Multi-user floods, browser freezing on complex source files, administrator-installed language/theme/plugins, external event-observer side effects and infrastructure compromises are not eliminated by this plugin.

Direct forged XML can contain HTML that Moodle's purifier allows, including permitted links/resources. Such content is handled under the existing question-author capability; this plugin is not a remote-resource privacy firewall. Its normal converter exports plain text. Review question content and site filtering policies.

Only the environments above were exercised in this 0.1.2 security review. See QA.md for subsequent Moodle 5.3 functional verification; the full adversarial suite was not rerun on 5.3. Other databases/PHP versions/themes, complete RTL behavior, hosted CI and full Behat execution remain unverified. Full frontend style-lint compliance remains an open beta release gate, not a passed security test. Report suspected vulnerabilities privately to the plugin/site maintainer with the version and a minimal reproduction; do not include live student data, passwords or session cookies in public reports.
