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
use qbank_uniquiz\local\categories;

#[\PHPUnit\Framework\Attributes\CoversClass(access::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(importer::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(categories::class)]
/**
 * Destination permissions and request-owned transaction regression tests.
 * @covers \qbank_uniquiz\local\access
 * @covers \qbank_uniquiz\local\importer
 * @covers \qbank_uniquiz\local\categories
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
        $this->assertSame([], categories::search([$context])['categories']);
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
        $this->assertNotEmpty(categories::search([$context])['categories']);
    }

    /**
     * Destination pages stay bounded and search wildcard characters remain literal.
     */
    public function test_category_pagination_and_search(): void {
        global $DB;
        [, $category, $context] = $this->destination();
        for ($i = 0; $i < 51; $i++) {
            $DB->insert_record('question_categories', (object)[
                'contextid' => $context->id, 'name' => sprintf('Paging fixture %03d', $i),
                'info' => '', 'infoformat' => FORMAT_HTML, 'parent' => $category->parent,
                'sortorder' => $i, 'stamp' => make_unique_id_code(),
            ]);
        }
        $first = categories::search([$context], 'Paging fixture');
        $last = categories::search([$context], 'Paging fixture', 1);
        $this->assertCount(50, $first['categories']);
        $this->assertTrue($first['more']);
        $this->assertCount(1, $last['categories']);
        $this->assertFalse($last['more']);
        $this->assertSame([], array_intersect(array_column($first['categories'], 'id'), array_column($last['categories'], 'id')));
        $this->assertSame([], categories::search([$context], '%')['categories']);
        $this->assertCount(1, categories::search([$context], 'Paging fixture 050')['categories']);
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
     * A successful batch is committed; failure after native postprocessing rolls back the whole batch.
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
        require_once($GLOBALS['CFG']->dirroot . '/question/format/xml/format.php');
        $format = new class extends \qformat_xml {
            /** @var int Number of real questions created before the injected failure. */
            public int $observed = 0;

            /**
             * Fail after successful native postprocessing but before commit.
             * @return bool Always throws after successful postprocessing
             */
            public function importpostprocess() {
                parent::importpostprocess();
                $this->observed = count($this->questionids);
                throw new \RuntimeException('Synthetic postprocessing failure');
            }
        };
        try {
            importer::run('<quiz>' . $this->question() . $this->question() . '</quiz>', 2, $category, $course, $format);
            $this->fail('Injected late failure did not propagate.');
        } catch (\RuntimeException $error) {
            $this->assertSame(2, $format->observed);
            foreach ($before as $table => $total) {
                $this->assertSame($total, $DB->count_records($table), $table);
            }
            $this->assertFalse($DB->is_transaction_started());
        }
    }
}
