<?php
// Read-only assertion against the disposable acceptance database.
define('CLI_SCRIPT', true);
require(getenv('UNIQUIZ_MOODLE_ROOT') . '/config.php');
$report = json_decode(file_get_contents(getenv('UNIQUIZ_QA_RESULTS') . '/ci-security.json'), true);
$count = $DB->count_records('question', ['name' => $report['raceQuestionName']]);
if ($count !== 1) {
    throw new RuntimeException('Expected exactly one question after concurrent retries.');
}
echo "Concurrent retry database assertion passed: one question.\n";
