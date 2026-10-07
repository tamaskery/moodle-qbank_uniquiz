<?php
// Run only in the isolated local Moodle QA containers. Never deploy in the plugin ZIP.
define('CLI_SCRIPT', true);
require(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/question/editlib.php');
require_once($CFG->dirroot . '/question/format.php');
require_once($CFG->dirroot . '/question/format/xml/format.php');

use qbank_uniquiz\local\access;
use qbank_uniquiz\local\importer;
use qbank_uniquiz\local\xml_validator;
use core_question\local\bank\question_edit_contexts;

\core\session\manager::set_user(get_admin());
$CFG->noemailever = true;
$checks = [];
function check(bool $ok, string $name): void {
    global $checks;
    $checks[] = ['name' => $name, 'passed' => $ok];
    if (!$ok) {
        throw new RuntimeException('FAILED: ' . $name);
    }
}
function rejects(callable $call, string $name): void {
    try { $call(); } catch (Throwable $error) { check(true, $name); return; }
    check(false, $name);
}
function newcourse(string $label): stdClass {
    global $DB;
    return create_course((object)[
        'fullname' => 'UniQuiz plugin QA ' . $label,
        'shortname' => 'uqplugin-' . $label . '-' . bin2hex(random_bytes(3)),
        'category' => $DB->get_field('course_categories', 'id', [], IGNORE_MULTIPLE),
        'format' => 'topics', 'numsections' => 1,
    ]);
}
function bank(stdClass $course): array {
    global $CFG;
    if ((int)$CFG->branch >= 500) {
        $cm = \core_question\local\bank\question_bank_helper::get_default_open_instance_system_type($course, true);
        $context = context_module::instance($cm->id);
        return [question_get_default_category($context->id, true), $context, ['cmid' => $cm->id]];
    }
    $context = context_course::instance($course->id);
    $category = question_make_default_categories((new question_edit_contexts($context))->all());
    return [$category, $context, ['courseid' => $course->id]];
}
function testuser(string $username): stdClass {
    global $DB;
    $user = $DB->get_record('user', ['username' => $username]);
    if ($user) return $user;
    $id = user_create_user((object)[
        'username' => $username, 'password' => hash_internal_user_password('UniQuizTeacherTest!'),
        'firstname' => 'UniQuiz', 'lastname' => $username, 'email' => "$username@example.invalid",
        'auth' => 'manual', 'confirmed' => 1, 'mnethostid' => 1,
    ], false, false);
    return $DB->get_record('user', ['id' => $id], '*', MUST_EXIST);
}
function enrol(stdClass $course, stdClass $user, string $archetype): void {
    global $DB;
    $plugin = enrol_get_plugin('manual');
    $instances = enrol_get_instances($course->id, true);
    $instance = current(array_filter($instances, static fn($item) => $item->enrol === 'manual'));
    if (!$instance) {
        $id = $plugin->add_instance($course);
        $instance = $DB->get_record('enrol', ['id' => $id]);
    }
    $roleid = $DB->get_field('role', 'id', ['archetype' => $archetype], IGNORE_MULTIPLE);
    $plugin->enrol_user($instance, $user->id, $roleid);
}

$course = newcourse('primary');
[$category, $context, $params] = bank($course);
$othercourse = newcourse('other');
[$othercategory, $othercontext] = bank($othercourse);
$teacher = testuser('uniquizteacher');
$student = testuser('uniquizstudent');
enrol($course, $teacher, 'editingteacher');
enrol($course, $student, 'student');
set_config('site_is_public', 0);
set_config('registerauth', '');
$xml = file_get_contents('/tmp/uniquiz-six.xml');
[$prepared, $count] = xml_validator::prepare($xml, 6);
check($count === 6, 'Server accepts all six supported question types');

foreach ([
    'DOCTYPE/entity rejected' => str_replace('<quiz>', '<!DOCTYPE quiz [<!ENTITY bad SYSTEM "file:///etc/passwd">]><quiz>', $xml),
    'Unsupported type rejected' => str_replace('type="essay"', 'type="calculated"', $xml),
    'Embedded files rejected' => str_replace('</quiz>', '<question type="essay"><file>abc</file></question></quiz>', $xml),
    'Invalid fraction rejected' => str_replace('fraction="100"', 'fraction="101"', $xml),
    'Invalid tolerance rejected' => str_replace('<tolerance>0.01</tolerance>', '<tolerance>-1</tolerance>', $xml),
    'Malformed XML rejected' => str_replace('</quiz>', '', $xml),
    'Duplicate singleton rejected' => str_replace('<hidden>0</hidden>', '<hidden>0</hidden><hidden>0</hidden>', $xml),
    'Essay attachments rejected' => str_replace('<attachments>0</attachments>', '<attachments>3</attachments>', $xml),
    'Question namespace rejected' => str_replace('<question type="essay">', '<question xmlns="urn:bad" type="essay">', $xml),
] as $name => $badxml) {
    rejects(static fn() => xml_validator::prepare($badxml, 6), $name);
}
rejects(static fn() => xml_validator::prepare($xml, 5), 'Question-count mismatch rejected');
rejects(static fn() => xml_validator::prepare(str_repeat('x', xml_validator::MAX_BYTES + 1), 6), 'Oversized input rejected');
$categoryxml = str_replace('<quiz>', '<quiz><question type="category"><category><text>$system$/top/Unexpected</text></category></question>', $xml);
[$withoutcategories] = xml_validator::prepare($categoryxml, 6);
check(strpos($withoutcategories, 'type="category"') === false, 'Source category markers removed before import');
$xss = str_replace('Which city is the capital of Hungary?', 'Test &lt;script&gt;alert(1)&lt;/script&gt;', $xml);
[$sanitized] = xml_validator::prepare($xss, 6);
check(strpos($sanitized, '&lt;script&gt;') === false, 'HTML script content sanitized on server');

\core\session\manager::set_user($student);
rejects(static fn() => access::category($category->id, [$context]), 'Student cannot import');
\core\session\manager::set_user($teacher);
$checked = access::category($category->id, [$context]);
check((int)$checked->id === (int)$category->id, 'Editing teacher may import into own course bank');
rejects(static fn() => access::category($othercategory->id, [$context]), 'Destination outside allowed context rejected');
rejects(static fn() => access::category($othercategory->id, [$othercontext]), 'Foreign destination capability independently checked');
rejects(static fn() => access::category($category->parent, [$context]), 'Top pseudo-category rejected');

$ids = importer::run($categoryxml, 6, $checked, $course);
check(count($ids) === 6, 'Teacher imports six questions through plugin importer');
$expected = json_decode(file_get_contents('/tmp/uniquiz-expected.json'), true);
foreach ($ids as $i => $id) {
    $question = $DB->get_record('question', ['id' => $id], '*', MUST_EXIST);
    $expect = $expected['questions'][$i];
    check($question->qtype === $expect['type'], "Question $i type");
    check($question->name === $expect['name'], "Question $i name");
    check($question->questiontext === $expect['text'], "Question $i text");
    check(abs($question->defaultmark - $expect['defaultMark']) < 0.000001, "Question $i mark");
    $answers = array_values($DB->get_records('question_answers', ['question' => $id], 'id'));
    check(count($answers) === count($expect['answers']), "Question $i answer count");
    foreach ($answers as $j => $answer) {
        check($answer->answer === $expect['answers'][$j]['text'], "Question $i answer $j text");
        check(abs($answer->fraction - $expect['answers'][$j]['fraction'] / 100) < 0.000001, "Question $i answer $j grade");
        check($answer->feedback === $expect['answers'][$j]['feedback'], "Question $i answer $j feedback");
        if (isset($expect['answers'][$j]['tolerance'])) {
            $tolerance = $DB->get_field('question_numerical', 'tolerance', ['question' => $id, 'answer' => $answer->id]);
            check(abs($tolerance - $expect['answers'][$j]['tolerance']) < 0.000001, "Question $i answer $j tolerance");
        }
    }
    $categoryactual = $DB->get_field_sql('SELECT b.questioncategoryid FROM {question_bank_entries} b
        JOIN {question_versions} v ON v.questionbankentryid = b.id WHERE v.questionid = ?', [$id]);
    check((int)$categoryactual === (int)$category->id, "Question $i stays in chosen destination");
}

// A finite grade accepted by the envelope exceeds the DB numeric precision at question 2.
// This proves rollback after question 1 was already inserted, not only parse-error rejection.
$broken = new DOMDocument();
$broken->loadXML($xml);
$broken->getElementsByTagName('defaultgrade')->item(1)->textContent = '1e100';
$before = [];
foreach (['question', 'question_bank_entries', 'question_versions', 'question_answers'] as $table) {
    $before[$table] = $DB->count_records($table);
}
rejects(static fn() => importer::run($broken->saveXML(), 6, $checked, $course), 'Late database failure reported');
foreach ($before as $table => $total) {
    check($DB->count_records($table) === $total, "Failed batch rolls back $table");
}
check(!$DB->is_transaction_started(), 'No transaction left open after failure');

// Real imports of converter output preserve HTML-facing text and literal accepted answers.
$textids = importer::run(file_get_contents('/tmp/uniquiz-text.xml'), 2, $checked, $course);
$textquestion = $DB->get_record('question', ['id' => $textids[0]], '*', MUST_EXIST);
check(str_contains($textquestion->questiontext, 'a&lt;b and c&gt;d &amp; literal &amp;lt;'), 'Literal comparisons survive core sanitization');
check((bool)preg_match('~<br\s*/?>Second line 🦄~u', $textquestion->questiontext), 'Line breaks and supplementary Unicode survive import');
$mcanswer = $DB->get_record('question_answers', ['question' => $textids[0], 'fraction' => 1], '*', MUST_EXIST);
check(str_contains($mcanswer->answer, '&lt;yes&gt;'), 'Multiple-choice answer markup remains literal');
check(str_contains($mcanswer->feedback, '&lt;feedback&gt;'), 'Answer feedback markup remains literal');
$saanswer = $DB->get_record('question_answers', ['question' => $textids[1]], '*', MUST_EXIST);
check($saanswer->answer === 'a<b & c', 'Short Answer accepted value is not HTML-encoded');

// Benchmark the actual synchronous ceiling with MC answers, tags and normal core events.
$batchdoc = new DOMDocument();
$batchdoc->loadXML($xml);
$batchquestion = $batchdoc->getElementsByTagName('question')->item(0);
while ($batchquestion && $batchquestion->getAttribute('type') === 'category') {
    $batchquestion = $batchquestion->nextElementSibling;
}
$questionxml = $batchdoc->saveXML($batchquestion);
$batchxml = '<quiz>' . str_repeat($questionxml, 500) . '</quiz>';
$start = microtime(true);
$batchids = importer::run($batchxml, 500, $checked, $course);
$benchmark = ['questions' => count($batchids), 'seconds' => round(microtime(true) - $start, 3),
    'process_peak_memory_bytes' => memory_get_peak_usage(true), 'xml_bytes' => strlen($batchxml)];
check(count($batchids) === 500, '500-question boundary batch imports atomically');
rejects(static fn() => xml_validator::prepare('<quiz>' . str_repeat($questionxml, 501) . '</quiz>', 501),
    '501-question batch rejected before core import');

$navigation = (new \qbank_uniquiz\plugin_feature())->get_navigation_node();
check($navigation->get_navigation_key() === 'uniquiz', 'Native question-bank navigation registered');
$report = ['release' => $CFG->release, 'checks' => $checks, 'passed' => count($checks), 'benchmark' => $benchmark,
    'courseid' => $course->id, 'categoryid' => $category->id, 'contextid' => $context->id,
    'othercategoryid' => $othercategory->id, 'params' => $params,
    'url' => (new moodle_url('/question/bank/uniquiz/index.php', $params))->out(false)];
file_put_contents('/tmp/uniquiz-plugin-report.json', json_encode($report, JSON_PRETTY_PRINT));
echo json_encode($report, JSON_PRETTY_PRINT) . "\n";
