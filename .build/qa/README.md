# Reproducing disposable Moodle acceptance checks

This harness is part of the public source repository, not the installable ZIP. Run it only against an isolated disposable Moodle installation. CI creates synthetic courses, users, categories and questions; `fault.php` is a test endpoint that must never be deployed to a real site.

The authoritative setup and commands are in [the CI workflow](../../.github/workflows/moodle-ci.yml). Check out the tested commit from [QA.md](../../QA.md) or the kit's `PACKAGE.json`, then use that workflow at the same ref. Pull requests trigger all four environments automatically. The workflow installs Moodle Plugin CI, Moodle, database services, browser dependencies and the official language packs before running the harness; running `integration.php` alone from the repository is insufficient.

The `Real import and browser acceptance` step generates converter XML with `fixtures.mjs`, copies `integration.php` into Moodle's plugin directory as `qa.php` so it can bootstrap the isolated site, and executes it as CLI PHP. The shared [grading fixture](../../tests/fixtures/grading-vectors.json) supplies XML percentages and independent expected canonical stored proportions for every `coreImport` case. The production importer uses `setMatchgrades('error')`.

For each marked vector, `integration.php` asserts import success, answer count and order, then reads `question_answers.fraction` and compares at the database's seven-decimal precision against `storedFractions`. It does not derive expectations with core's matching function. Thirds must store `0.3333333`, sixths `0.1666667`, and XML percentages near 50 must store `0.5000000`. Raw returned database text, the input percentages and the expected proportions are retained in `ci-integration.json` under `storedGrading`. This records core's canonicalization rather than claiming that XML percentage digits survive unchanged.

The workflow also runs native Grunt in the installed Moodle plugin, then compares its complete `amd/build` directory with the committed/rebuilt candidate directory. The `Verify native Grunt AMD consistency` step must pass in every environment.

Download all four `acceptance-*` artifacts from the run linked in QA.md. Each includes `ci-integration.json`, browser/security/language reports, exported XML and screenshots. To retrieve a run from the GitHub CLI:

```sh
gh run view RUN_ID --repo tamaskery/moodle-qbank_uniquiz --log
gh run download RUN_ID --repo tamaskery/moodle-qbank_uniquiz --dir acceptance
```

Inspect `checks` and `storedGrading` in each integration report, and match the run's head SHA to the candidate source. The separate submission kit summarizes inspected results in `EVIDENCE.json` and exact packaged-head results in `FINAL-CI-EVIDENCE.json`; `PACKAGE.json` binds the archive checksum to that head. Historical evidence and older UI illustrations are labelled with their own commit/run.
