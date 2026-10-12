<?php
// Disposable acceptance fault endpoint. Excluded from distributables by .build export-ignore.
define('AJAX_SCRIPT', true);
require(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/question/editlib.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');
require_login();
require_sesskey();
[$url, $contexts] = question_edit_setup('import', '/question/bank/uniquiz/qa-fault.php');
$category = \qbank_uniquiz\local\access::category(required_param('categoryid', PARAM_INT),
    $contexts->having_cap('moodle/question:add'));
$format = new class extends qformat_xml {
    public function importpostprocess() {
        parent::importpostprocess();
        throw new RuntimeException('Synthetic secret source content');
    }
};
try {
    \qbank_uniquiz\local\importer::run(required_param('xml', PARAM_RAW), required_param('count', PARAM_INT),
        $category, $COURSE, $format);
    throw new RuntimeException('Fixture failed to throw');
} catch (Throwable $error) {
    [$status, $result] = \qbank_uniquiz\local\error_reporter::response($error);
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($result);
}
