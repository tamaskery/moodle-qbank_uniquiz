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

namespace qbank_uniquiz;

use qbank_uniquiz\local\access;
use qbank_uniquiz\local\importer;

#[\PHPUnit\Framework\Attributes\CoversClass(access::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(importer::class)]
/**
 * Destination permissions and request-owned transaction regression tests.
 * @covers \qbank_uniquiz\local\access
 * @covers \qbank_uniquiz\local\importer
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class importer_test extends \advanced_testcase {
    /**
     * Prepare independent database reset instead of a PHPUnit outer transaction.
     */
    protected function setUp(): void {
        global $CFG;
        parent::setUp();
        $this->preventResetByRollback();
        $this->resetAfterTest();
        $this->setAdminUser();
        require_once($CFG->dirroot . '/question/editlib.php');
    }

    /**
     * Course, category and real context.
     * @return array
     */
    private function destination(): array {
        global $CFG;
        $course = $this->getDataGenerator()->create_course();
        if ((int)$CFG->branch >= 500) {
            $cm = \core_question\local\bank\question_bank_helper::get_default_open_instance_system_type($course, true);
            $context = \context_module::instance($cm->id);
            $category = question_get_default_category($context->id, true);
        } else {
            $context = \context_course::instance($course->id);
            $contexts = new \core_question\local\bank\question_edit_contexts($context);
            $category = question_make_default_categories($contexts->all());
        }
        return [$course, $category, $context];
    }

    /**
     * One valid multiple-choice question.
     * @return string
     */
    private function question(): string {
        return '<question type="multichoice"><name><text>Example</text></name>' .
            '<questiontext format="html"><text>Choose</text></questiontext><defaultgrade>1</defaultgrade>' .
            '<single>true</single><shuffleanswers>1</shuffleanswers><answernumbering>abc</answernumbering>' .
            '<answer fraction="100" format="html"><text>Yes</text></answer>' .
            '<answer fraction="0" format="html"><text>No</text></answer></question>';
    }

    /**
     * Real destination capability is required, even with a valid context id.
     */
    public function test_student_denied_and_teacher_allowed(): void {
        [$course, $category, $context] = $this->destination();
        $student = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($student->id, $course->id, 'student');
        $this->setUser($student);
        try {
            access::category($category->id, [$context]);
            $this->fail('Student was allowed to import.');
        } catch (\required_capability_exception $error) {
            $this->assertNotEmpty($error->getMessage());
        }
        $teacher = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($teacher->id, $course->id, 'editingteacher');
        $this->setUser($teacher);
        $this->assertEquals($category->id, access::category($category->id, [$context])->id);
    }

    /**
     * Authorized callers still cannot redirect a request to a foreign context.
     */
    public function test_destination_context_boundary(): void {
        [, $category] = $this->destination();
        [, , $foreigncontext] = $this->destination();
        $this->expectException(\moodle_exception::class);
        access::category($category->id, [$foreigncontext]);
    }

    /**
     * A successful batch is committed; failure on question two rolls back question one.
     */
    public function test_success_and_late_failure_rollback(): void {
        global $DB;
        [$course, $category, $context] = $this->destination();
        $category = access::category($category->id, [$context]);
        $ids = importer::run('<quiz>' . $this->question() . '</quiz>', 1, $category, $course);
        $this->assertCount(1, $ids);
        $this->assertTrue($DB->record_exists('question', ['id' => $ids[0]]));
        $before = [];
        foreach (['question', 'question_bank_entries', 'question_versions', 'question_answers'] as $table) {
            $before[$table] = $DB->count_records($table);
        }
        $broken = str_replace('<defaultgrade>1</defaultgrade>', '<defaultgrade>1e100</defaultgrade>', $this->question());
        try {
            importer::run('<quiz>' . $this->question() . $broken . '</quiz>', 2, $category, $course);
            $this->fail('Out-of-range database mark did not fail.');
        } catch (\dml_exception $error) {
            foreach ($before as $table => $total) {
                $this->assertSame($total, $DB->count_records($table), $table);
            }
            $this->assertFalse($DB->is_transaction_started());
        }
    }
}
