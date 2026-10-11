# Resolution of the reviewer findings in 0.1.7

This is an implementation response, not an independent audit. QA.md identifies the hosted tested commit and actual results.

| Finding | Candidate behavior |
| --- | --- |
| Unbounded defaultgrade | Browser analysis, generated-XML validation and server validation enforce 0.0000001–10000; Description requires 0. Rejected before core import with 422. |
| Float boundary | Each positive XML percentage is rounded half-up to seven decimal places, then scaled and summed as an integer. The 0.0001 allowance is inclusive. Four-decimal thirds are accepted deliberately and checked against native core grade matching and explicit canonical stored proportions by `.build/qa/integration.php`. This scale is an XML percentage policy, not Moodle's stored proportional-fraction scale. |
| Tolerance exponent output | Shortest round-trip decimal expansion preserves numeric precision and emits plain decimals. Integration records exported text and raw DB-returned text separately. |
| Translation semantics | Full-credit and bounded-mark messages have new semantic keys and a migration map. Four complete native translation sources are bundled and checked for placeholder/key parity. |
| Failed-token retries | Twenty authorized attempts per token and fifty per session in ten minutes. Failed attempts count; successful identical replay bypasses work counters. Temporary 429 response retains prepared questions and includes Retry-After. Separate sessions remain outside this budget. |
| Receipt eviction | Only expired receipts are removed. At 200 live receipts, new issuance is refused with guidance; existing draft and successful retry tokens are preserved. |
| Markup in plain fields | Literal names/Short Answer values remain data; encoding accepted answers would change matching. Numerical and True/False values remain strictly constrained. SECURITY.md documents reliance on core display behavior and the staging gate. |
| Shipping tests | Shared grading vectors, receipt expiry/capacity/retry tests and importer rollback tests ship as PHPUnit. Disposable HTTP/concurrency/browser harnesses remain in the public repository, excluded from installation. |
| Categories | Authorized name search, 50-result pages, literal wildcard handling, bounded ancestor lookup and safe text insertion. Selected destination remains stable; choosing another clears confirmation. |
| Mutable static diagnostics | Each prepare call creates an independent validator instance. |
| Category marker number | Document-level category[n] location, without advancing the actual-question number. |
| Tag length | Existing 255-character limit remains; the proposed 50-character restriction was incorrect for the tested branches. |

Ordinary event-observer exceptions are unsuitable as a reliable rollback fixture where core catches them. Tests inject a trusted qformat_xml subclass that fails after native postprocessing and before the plugin commits. HTTP inputs cannot select or supply that dependency. A disposable CI-only fault endpoint exercises the production error mapper and is excluded from archives.

No intended-site staging access, production deployment, merge, release tag or Marketplace submission. These changes do not certify arbitrary themes, native display surfaces or translation fluency; site acceptance and human linguistic review remain separate.

Final review polish in build `2026101102` uses `XML_PERCENTAGE_SCALE` and `xmlPercentageScale` to make the percentage units explicit. The public harness guide at `.build/qa/README.md` describes reproduction; integration reports include input percentages, independent expected canonical proportions and raw database-returned fractions. All four environments passed those stored-value assertions and an explicit native-Grunt comparison against files extracted from the committed Git tree. QA.md and EVIDENCE.json identify the inspected run; the kit includes HARNESS.md and the exact packaged-head evidence.
