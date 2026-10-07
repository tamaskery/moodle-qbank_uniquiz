# Developing UniQuiz

Report bugs and feature requests in this repository's Issues. Include the plugin and Moodle versions and a synthetic reproduction; never include passwords, session cookies or student data.

The repository root is the installable `qbank_uniquiz` plugin. The `.build` folder contains the browser-engine sources and plugin build adapter. These development sources are covered by the same GNU GPL v3-or-later licence as the bundled plugin.

To rebuild generated AMD JavaScript, source maps, templates, styles and English strings:

```sh
npm ci --prefix .build/tools
npm ci --prefix .build/moodle --ignore-scripts
node .build/tools/build.mjs
```

Edit `.build/source` and `.build/tools`, then rebuild. Do not edit generated AMD files directly. `ENGINE-SOURCES.json` paths are relative to `.build/source`.

The CI workflow runs Moodle Plugin CI against PostgreSQL and MariaDB. All checks are required for submission readiness; a failing job must not be represented as a pass. See QA.md for candidate results and remaining deployment gates. Stable translation keys are held in the explicit registry; preserve keys when editing English copy, as described in TRANSLATING.md.

Use an explicit release version increase for distributable changes. Build tooling and CI files are excluded by `git archive` export rules; development dependencies and private site configuration must never enter release packages.
