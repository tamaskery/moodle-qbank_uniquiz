# Translating UniQuiz

Version 0.1.2 routes the converter, column-mapping controls, settings, preview, accessibility labels, diagnostics, AIKEN fixer, guide and direct-import messages through Moodle's `qbank_uniquiz` language component. The package includes English fallback strings, not a completed non-English translation.

## Site administrators and translators

Use **Site administration → Language → Language customisation**, select the target installed language, load its strings, and filter the component to `qbank_uniquiz.php`. Translate and save the local language pack using Moodle's normal workflow. Moodle selects the user's/course's effective language and falls back to English for missing entries. Purge Moodle caches when deploying language files manually; reopen the wizard after a language change. This follows [Moodle's language customisation workflow](https://docs.moodle.org/en/Language_customisation).

For a distributable translation, provide `lang/<language>/qbank_uniquiz.php` using the keys from `lang/en/qbank_uniquiz.php`, with valid UTF-8 PHP syntax. Treat language-pack PHP files as trusted executable code; only an administrator should install them. The build retains additional language directories. No Moodle language-service/AMOS publication is claimed for this unpublished beta.

- `ui_…` strings are template labels/help. `js_…` strings are dynamic browser messages. Short keys such as `importsuccess` are native PHP/bridge messages.
- Keep `{$a}`, `{$a->question}`, `{$a->field}`, `{$a->reason}` and numbered placeholders such as `{$a->p0}` exactly intact. Move them within the translated sentence as needed. Numbered placeholders are substituted once, as literal text; values containing `$&` or another placeholder are not reinterpreted.
- Browser strings are plain text, not HTML. Do not add markup expecting it to render. Template text and attributes use escaped Mustache variables; dynamic messages use text nodes.
- Do not translate technical examples/tokens: CSV field names such as `question_text`, type codes such as `shortanswer`, answer labels, `true`/`false` input values, `ANSWER:`, XML tags or diagnostic codes. Technical tokens inside otherwise translated help sentences must remain unchanged.
- Source questions, accepted answers, filenames, user-supplied column headers, generated fallback question names and exported XML are data, not language strings. They intentionally stay unchanged. Synthetic column labels shown in mapping are localized separately from parser headers.
- Existing singular/plural message choices use one/other forms. Where a sentence contains a separately translated noun or code example, check the assembled wording in the live wizard. Display numbers use the effective language where the UI formats them; XML numbers keep invariant syntax.

## Maintainers

Do not hand-edit generated English strings or AMD files. Edit `moodle-plugin/build-tools/lang-en.php` for native messages, the shared UI/engine source for its prose, or `build-tools/help.mustache` for the guide, then rebuild. The plugin-only syntax-aware adapter extracts display strings while preserving selectors, CSS classes, diagnostic severity codes and parser/export syntax. The standalone site's language behavior is unchanged.

Generated identifiers contain a readable slug and an English-text hash. Unchanged text retains its key; changing source wording generates a new key that needs translation. Usage locations and placeholder descriptions are in the source repository's `build-tools/language-catalogue.json`. Review this manifest and remaining literals after source changes; heuristics are not a substitute for that review.

Pre-1.0 maintenance gate: replace generated identifiers for stable UI with explicit semantic keys and publish an old-to-new translation migration map. Until that migration, wording changes require a catalogue diff and translator review. This patch retains existing identifiers to avoid an unannounced mass translation reset. The build sorts native and generated English keys together; language QA enforces uniqueness and alphabetical order.

Before release, run `node qa/moodle-plugin-language.mjs`, `node qa/check-plugin-assets.mjs`, and the real Moodle browser suites. The 0.1.2 audit tested English and a deliberately modified language pack, including hostile HTML in a template attribute and a diagnostic, on Moodle 4.5 and 5.2. That proves the tested wiring/escaping and export invariance, not linguistic quality, complete RTL layout or every locale's grammar.
