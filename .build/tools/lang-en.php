<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * English plugin strings. Generated browser strings are appended during the build.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
$string['pluginname'] = 'UniQuiz';
$string['destination'] = 'Import into category';
$string['importconfirm'] = 'Import these questions';
$string['importintro'] = 'Review the destination before importing. This sends the prepared questions to this Moodle site and creates new questions. It does not replace existing questions.';
$string['categorypolicy'] = 'All questions go into the selected category. Category paths from the source are retained in the XML download but do not create or select categories during direct import.';
$string['importsuccess'] = '{$a} questions imported successfully.';
$string['importsuccesssingle'] = '{$a} question imported successfully.';
$string['importfailed'] = 'The import failed. No questions from this batch were saved. Review the source and try again.';
$string['invalidxml'] = 'Cannot import this file ({$a->field}): {$a->reason}';
$string['invalidxmlquestion'] = 'Question {$a->question}, {$a->field}: {$a->reason}';
$string['batchlimit'] = 'Direct import is limited to {$a} questions. Split the source into smaller batches, or download the XML.';
$string['xmlstructure'] = 'The XML structure or question options are invalid or unsupported.';
$string['xmlnumber'] = 'A numeric value is invalid.';
$string['xmlmalformed'] = 'The XML document is malformed or contains unsupported markup.';
$string['xmltag'] = 'A tag would be changed by Moodle. Use at most 255 characters, single spaces, and no control characters, angle brackets or backticks.';
$string['xmlnamelength'] = 'The question name exceeds 255 characters.';
$string['xmlcount'] = 'The submitted question count does not match the XML.';
$string['xmlencoding'] = 'Direct import requires UTF-8 XML.';
$string['xmlcomplexity'] = 'This batch exceeds a direct-import complexity limit: 100 answers or tags per question, 5000 answers or tags per batch, 500 category markers, or 50000 XML elements. Split or simplify the source, or download XML.';
$string['xmlfieldlimit'] = 'A text field exceeds the direct-import limit of 256 KiB. Shorten it, or download XML.';
$string['importfailedreference'] = 'Moodle could not confirm the import. Check the question bank before starting another batch. Ask your administrator to check the server error log using reference {$a}.';
$string['converter'] = 'Converter';
$string['aikenfixer'] = 'AIKEN fixer';
$string['guidetitle'] = 'UniQuiz guide';
$string['importcount'] = 'Import {$a} questions';
$string['importcountsingle'] = 'Import {$a} question';
$string['xmltoolarge'] = 'This generated XML is too large for direct import. Split the source into smaller files.';
$string['importing'] = 'Importing questions into Moodle…';
$string['noresult'] = 'Moodle did not return a confirmed import result. Your session or connection may have expired. Check the question bank before starting a new import.';
$string['invalidrequest'] = 'This import request has expired or changed. Prepare the questions again.';
$string['importbusy'] = 'Another import is running for this account. Please try again shortly.';
$string['returnbank'] = 'Return to question bank';
$string['privacy:metadata'] = 'UniQuiz parses source files in browser memory. On confirmation it creates questions using Moodle question APIs. These questions and the standard import events are managed by Moodle. Temporary session receipts contain request hashes and counts, not question content; UniQuiz creates no separate persistent personal-data store.';
