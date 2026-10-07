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
 * Native question-bank preparation wizard.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/question/editlib.php');
require_login();
\core_question\local\bank\helper::require_plugin_enabled('qbank_uniquiz');
[$url, $contexts, $cmid, $cm, $module, $pagevars] = question_edit_setup('import', '/question/bank/uniquiz/index.php');
$tool = optional_param('tool', 'converter', PARAM_ALPHA);
$tool = $tool === 'aiken' ? 'aiken' : 'converter';
$url->param('tool', $tool);
$PAGE->set_url($url);
$PAGE->set_title(get_string('pluginname', 'qbank_uniquiz'));
$PAGE->set_heading($COURSE->fullname);
$PAGE->activityheader->disable();
$allowed = $contexts->having_cap('moodle/question:add');
$contextids = array_map(static fn($context) => $context->id, $allowed);
[$insql, $params] = $DB->get_in_or_equal($contextids, SQL_PARAMS_NAMED);
$records = $DB->get_records_select('question_categories', "contextid $insql", $params, 'sortorder, name');
$selected = (int)explode(',', $pagevars['cat'])[0];
$categories = [];
foreach ($records as $record) {
    if (!$record->parent) {
        continue;
    }
    $parts = [$record->name];
    $parent = $record->parent;
    $visited = [$record->id];
    while (isset($records[$parent]) && $records[$parent]->parent && !in_array($parent, $visited)) {
        array_unshift($parts, $records[$parent]->name);
        $visited[] = $parent;
        $parent = $records[$parent]->parent;
    }
    $context = context::instance_by_id($record->contextid);
    $label = strip_tags($context->get_context_name(false)) . ' / ' . implode(' / ', $parts);
    $categories[] = ['id' => $record->id, 'name' => $label, 'selected' => (int)$record->id === $selected];
}
// Keep each complete hierarchy together instead of mixing sortorder values from contexts.
usort($categories, static fn($left, $right) => strnatcasecmp($left['name'], $right['name']));
$contextparams = $cmid ? ['cmid' => $cmid] : ['courseid' => $COURSE->id];
$bankurl = new moodle_url('/question/edit.php', $contextparams);
$converterurl = new moodle_url('/question/bank/uniquiz/index.php', $contextparams);
$aikenurl = new moodle_url('/question/bank/uniquiz/index.php', $contextparams + ['tool' => 'aiken']);
$helpurl = new moodle_url('/question/bank/uniquiz/help.php', $contextparams);
$token = bin2hex(random_bytes(24));
$receipts = $SESSION->qbank_uniquiz_receipts ?? [];
// Keep bounded session-only receipts for safe retries; no question content is stored here.
$receipts = array_filter($receipts, static fn($receipt) => $receipt['created'] > time() - 86400);
if (count($receipts) >= 50) {
    array_shift($receipts);
}
$receipts[$token] = ['created' => time(), 'contextparams' => $contextparams];
$SESSION->qbank_uniquiz_receipts = $receipts;
$stringkeys = \qbank_uniquiz\local\strings::keys('js_');
$PAGE->requires->strings_for_js($stringkeys, 'qbank_uniquiz');
$PAGE->requires->js_call_amd('qbank_uniquiz/bootstrap', 'init');
$config = [
    'tool' => $tool, 'stringkeys' => $stringkeys, 'language' => current_language(),
    'helpurl' => $helpurl->out(false),
    'importurl' => (new moodle_url('/question/bank/uniquiz/import.php'))->out(false),
    'contextparams' => $contextparams, 'token' => $token, 'sesskey' => sesskey(),
    'maxxmlbytes' => \qbank_uniquiz\local\xml_validator::MAX_BYTES,
    'maxquestions' => \qbank_uniquiz\local\xml_validator::MAX_QUESTIONS,
    'strings' => array_combine(
        ['importcount', 'importcountsingle', 'batchlimit', 'xmltoolarge', 'importing', 'noresult'],
        array_map(
            static fn($key) => get_string($key, 'qbank_uniquiz'),
            ['importcount', 'importcountsingle', 'batchlimit', 'xmltoolarge', 'importing', 'noresult']
        )
    ),
];
echo $OUTPUT->header();
echo $OUTPUT->render(new \core_question\output\qbank_action_menu($url));
echo $OUTPUT->tabtree([
    new tabobject('converter', $converterurl, get_string('converter', 'qbank_uniquiz')),
    new tabobject('aiken', $aikenurl, get_string('aikenfixer', 'qbank_uniquiz')),
], $tool);
echo $OUTPUT->render_from_template('qbank_uniquiz/' . $tool, [
    'lang' => \qbank_uniquiz\local\strings::template_context(),
    'config' => json_encode($config),
    'baseurl' => (new moodle_url('/question/bank/uniquiz'))->out(false),
    'converterurl' => $converterurl->out(false), 'helpurl' => $helpurl->out(false),
    'bankurl' => $bankurl->out(false), 'categories' => $categories,
    'destinationlabel' => get_string('destination', 'qbank_uniquiz'),
    'importintro' => get_string('importintro', 'qbank_uniquiz'),
    'categorypolicy' => get_string('categorypolicy', 'qbank_uniquiz'),
    'importconfirm' => get_string('importconfirm', 'qbank_uniquiz'),
    'returnbank' => get_string('returnbank', 'qbank_uniquiz'),
]);
echo $OUTPUT->footer();
