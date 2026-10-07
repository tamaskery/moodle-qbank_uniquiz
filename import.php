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
 * Confirmed, authenticated POST import. No source files are accepted by this endpoint.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('AJAX_SCRIPT', true);
require_once(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/question/editlib.php');
require_login();
require_sesskey();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    throw new moodle_exception('invalidrequest', 'qbank_uniquiz');
}
\core_question\local\bank\helper::require_plugin_enabled('qbank_uniquiz');
$token = required_param('token', PARAM_ALPHANUM);
$receipt = $SESSION->qbank_uniquiz_receipts[$token] ?? null;
if (!$receipt || $receipt['created'] < time() - 86400) {
    throw new moodle_exception('invalidrequest', 'qbank_uniquiz');
}
foreach ($receipt['contextparams'] as $name => $value) {
    if (required_param($name, PARAM_INT) !== (int)$value) {
        throw new moodle_exception('invalidrequest', 'qbank_uniquiz');
    }
}
[$url, $contexts, $cmid, $cm, $module, $pagevars] = question_edit_setup('import', '/question/bank/uniquiz/import.php');
$categoryid = required_param('categoryid', PARAM_INT);
$category = \qbank_uniquiz\local\access::category($categoryid, $contexts->having_cap('moodle/question:add'));
$xml = required_param('xml', PARAM_RAW);
$count = required_param('count', PARAM_INT);
$hash = hash('sha256', $categoryid . ':' . $count . ':' . $xml);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (isset($receipt['hash'])) {
    if (!hash_equals($receipt['hash'], $hash)) {
        throw new moodle_exception('invalidrequest', 'qbank_uniquiz');
    }
    echo json_encode($receipt['result']);
    exit;
}
// Moodle retains the session lock throughout this request, serializing concurrent retries.
try {
    $ids = \qbank_uniquiz\local\importer::run($xml, $count, $category, $COURSE);
    $bankurl = new moodle_url('/question/edit.php', $receipt['contextparams'] + [
        'category' => $category->id . ',' . $category->contextid,
    ]);
    $importedcount = count($ids);
    $result = ['success' => true, 'count' => $importedcount,
        'message' => get_string(
            $importedcount === 1 ? 'importsuccesssingle' : 'importsuccess',
            'qbank_uniquiz',
            $importedcount
        ),
        'bankurl' => $bankurl->out(false)];
    $SESSION->qbank_uniquiz_receipts[$token]['hash'] = $hash;
    $SESSION->qbank_uniquiz_receipts[$token]['result'] = $result;
    echo json_encode($result);
} catch (Throwable $error) {
    [$status, $result] = \qbank_uniquiz\local\error_reporter::response($error);
    http_response_code($status);
    echo json_encode($result);
}
