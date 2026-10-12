# Development lint configuration

`moodle-eslint` and `moodle-stylelint` are copies of the Moodle 5.3 core `.eslintrc` and `.stylelintrc` configuration, used under the GNU GPL v3 or later. Copyright belongs to the Moodle contributors. Source: https://github.com/moodle/moodle/tree/MOODLE_503_STABLE

These files and all development dependencies are excluded from the installable archive. No ESLint, Stylelint, Prettier, Babel or Playwright runtime is required on an administrator's Moodle server.

The locked package manifests in ../moodle and moodle-amd.cjs also come from Moodle 5.3. The adapter retains Ryan Wyllie's copyright notice; its component lookup is scoped to qbank_uniquiz. compile-amd.mjs follows the pipeline in Moodle's .grunt/tasks/javascript.js (Andrew Nicols, GPL v3 or later). These development files are excluded from release archives.
