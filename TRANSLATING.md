# Translating UniQuiz

UniQuiz routes the converter, column-mapping controls, settings, preview, accessibility labels, diagnostics, AIKEN fixer, guide and direct-import messages through Moodle's `qbank_uniquiz` language component. The package includes English fallback strings, not a completed non-English translation.

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

Do not hand-edit generated English strings or AMD files. Edit `.build/tools/lang-en.php` for native messages, the shared UI/engine source for its prose, or `.build/tools/help.mustache` for the guide, then rebuild. The plugin-only syntax-aware adapter extracts display strings while preserving selectors, CSS classes, diagnostic severity codes and parser/export syntax. The standalone site's language behavior is unchanged.

Version 0.1.5 uses explicitly registered, stable semantic identifiers. The English value can change while its registered key stays fixed. The build rejects unregistered prose, so wording changes cannot silently create replacement keys. Maintainers update the existing entry in `.build/tools/language-registry.json` and the source wording together. New messages need new descriptive keys; never reuse a key for a different meaning.

The complete 0.1.4-to-0.1.5 key map is published in `.build/tools/language-key-migration-0.1.4.json` in the public source repository. Before upgrading a customized language pack, back it up and rename each generated key using this map, retaining the translated value. Native PHP keys are unchanged. Review placeholders, import the updated pack through Moodle's language customization, and purge caches. Never execute a language PHP file obtained from an untrusted source.

Source locations and placeholder descriptions are in the build catalogue. The English language file is kept sorted and unique. The registry and migration map are development resources in the public repository, excluded from installable archives.

Before release, run `node .build/tools/check-language.mjs`, `node .build/tools/check-assets.mjs`, and the real Moodle browser suites. See QA.md for candidate pseudolanguage and hostile-translation checks. These test wiring, escaping and export invariance; they do not establish linguistic quality, complete RTL layout or every locale's grammar.