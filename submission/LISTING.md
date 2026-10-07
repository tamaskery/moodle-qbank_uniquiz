# Marketplace listing draft

## Identity

- Display name: UniQuiz
- Component: `qbank_uniquiz`
- Plugin type: Question bank plugin
- Distribution: Free, GNU GPL v3 or later
- Candidate release: 0.1.5 beta (`2026100702`)
- Source: https://github.com/tamaskery/moodle-qbank_uniquiz
- Issue tracker: https://github.com/tamaskery/moodle-qbank_uniquiz/issues
- Documentation: https://github.com/tamaskery/moodle-qbank_uniquiz/blob/main/README.md

## Short description

Prepare CSV and TXT question banks, review validation results, and export Moodle XML or import confirmed questions directly into a selected Moodle question category.

## Full description

UniQuiz adds a preparation wizard to Moodle's question bank. Teachers can select a CSV or TXT file, map unfamiliar columns, review questions and validation messages, configure scoring and metadata, and preview the resulting question bank before export or import.

Supported question types are Multiple Choice, True/False, Short Answer, basic Numerical, Essay and Description. A separate AIKEN tool checks formatting and offers safe repairs with a downloadable result.

File analysis runs in the browser. Questions are sent to the Moodle site only when the user explicitly confirms direct import. The plugin uses Moodle's existing question permissions and XML importer, validates imported XML on the server, and rolls back failed import batches. It does not use a third-party conversion service, analytics, external API or paid subscription.

Direct import supports up to 500 questions and 8 MiB of XML, with additional structure and field limits. Source files are limited to 5 MB. Larger valid banks can be downloaded as XML. Source text is treated as plain text; this beta does not provide a raw-HTML authoring mode.

English is included. The user interface and messages use Moodle language strings, with stable identifiers and a migration map for earlier beta customizations. Human translations are not bundled.

## Installation and upgrade

Upload the release ZIP through Site administration → Plugins → Install plugins, or place its `uniquiz` directory under `question/bank`. On Moodle 5.2 and 5.3 this is under the Moodle `public` directory. Complete the Moodle upgrade process, then enable UniQuiz in question-bank plugin administration if needed.

Open a question bank and choose UniQuiz in its action menu. Users need the existing `moodle/question:add` permission in the selected destination. Moodle's built-in `qformat_xml` component is required.

Before upgrading, back up the site and test on staging. Sites with customized 0.1.4 translations should migrate their keys as described in TRANSLATING.md. No plugin database migration is required.

## Compatibility and limitations

Select only the branches backed by the final candidate's passing CI results: Moodle 4.5, 5.2 and 5.3. Do not imply verification of 5.0 or 5.1 through an inclusive supported range. The release remains beta; testing does not certify arbitrary themes, database versions or production capacity.

## Submission checklist

- Attach the candidate ZIP and the screenshots supplied with this submission kit.
- Link the passing candidate CI run and public source/Issues URLs.
- Check the unique component name in the Marketplace submission form. A search-engine check is not name reservation.
- Confirm the provider profile, ownership declarations and current Marketplace terms using the maintainer's account.
- Submit for review only after automated archive/CI checks pass. Review approval and publication are separate actions.

This file prepares the listing; no Marketplace submission, acceptance of terms or publication is performed by the build.

## Current official guidance

The Moodle Plugins FAQ describes free and paid Marketplace submission, archive and CI validation, manual review, and publication by the provider after approval:
https://docs.moodle.org/503/en/Plugins_FAQ#How_do_I_submit_my_own_plugin_to_Moodle_Marketplace?

The old contribution checklist is marked legacy and directs new submissions to Marketplace guidance:
https://moodledev.io/general/community/plugincontribution/checklist

The linked detailed submission guidelines required Atlassian access during preparation. The maintainer should review the current account-visible requirements before submitting.
