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
 * Authenticated paginated category search for the import destination selector.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/question/editlib.php');
require_login();
require_sesskey();
\core_question\local\bank\helper::require_plugin_enabled('qbank_uniquiz');
[$url, $contexts, $cmid, $cm, $module, $pagevars] = question_edit_setup('import', '/question/bank/uniquiz/categories.php');
$search = optional_param('search', '', PARAM_RAW_TRIMMED);
$page = optional_param('page', 0, PARAM_INT);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(\qbank_uniquiz\local\categories::search($contexts->having_cap('moodle/question:add'), $search, $page));
