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
 * In-Moodle user guide.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/question/editlib.php');
require_login();
\core_question\local\bank\helper::require_plugin_enabled('qbank_uniquiz');
[$url, $contexts, $cmid, $cm, $module, $pagevars] = question_edit_setup('import', '/question/bank/uniquiz/help.php');
$PAGE->set_url($url);
$PAGE->set_title(get_string('guidetitle', 'qbank_uniquiz'));
$PAGE->set_heading($COURSE->fullname);
echo $OUTPUT->header();
echo $OUTPUT->render_from_template('qbank_uniquiz/help', [
    'lang' => \qbank_uniquiz\local\strings::template_context(),
    'baseurl' => (new moodle_url('/question/bank/uniquiz'))->out(false),
]);
echo $OUTPUT->footer();
