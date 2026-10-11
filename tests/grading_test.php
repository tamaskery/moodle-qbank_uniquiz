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

use qbank_uniquiz\local\grading;
use qbank_uniquiz\local\xml_validator;

#[\PHPUnit\Framework\Attributes\CoversClass(grading::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(xml_validator::class)]
/**
 * Shared browser/server grading vectors and safe database mark boundaries.
 * @covers \qbank_uniquiz\local\grading
 * @covers \qbank_uniquiz\local\xml_validator
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class grading_test extends \advanced_testcase {
    /**
     * Both runtimes consume the same total table, including rounding boundaries.
     */
    public function test_shared_total_vectors(): void {
        $fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/grading-vectors.json'), true);
        foreach ($fixture['totals'] as $vector) {
            $this->assertSame($vector['valid'], grading::valid_total($vector['fractions']), $vector['name']);
            $body = '<question type="multichoice"><name><text>Vector</text></name>' .
                '<questiontext format="html"><text>Choose</text></questiontext><defaultgrade>1</defaultgrade>' .
                '<single>false</single><shuffleanswers>1</shuffleanswers><answernumbering>abc</answernumbering>';
            foreach ($vector['fractions'] as $fraction) {
                $body .= '<answer fraction="' . json_encode($fraction) . '" format="html"><text>Option</text></answer>';
            }
            $xml = '<quiz>' . $body . '</question></quiz>';
            try {
                [, $count] = xml_validator::prepare($xml, 1);
                $this->assertTrue($vector['valid'], $vector['name']);
                $this->assertSame(1, $count);
            } catch (\moodle_exception $error) {
                $this->assertFalse($vector['valid'], $vector['name']);
                $this->assertSame('invalidxmlquestion', $error->errorcode);
            }
        }
    }

    /**
     * Marks outside the product/database-safe range fail before importing.
     */
    public function test_mark_boundaries_and_marker_location(): void {
        $fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/grading-vectors.json'), true);
        foreach ($fixture['marks'] as $vector) {
            $xml = '<quiz><question type="shortanswer"><name><text>Mark</text></name>' .
                '<questiontext format="html"><text>Answer</text></questiontext><defaultgrade>' .
                json_encode($vector['value']) . '</defaultgrade><usecase>0</usecase>' .
                '<answer fraction="100" format="html"><text>Yes</text></answer></question></quiz>';
            try {
                xml_validator::prepare($xml, 1);
                $this->assertTrue($vector['valid'], (string)$vector['value']);
            } catch (\moodle_exception $error) {
                $this->assertFalse($vector['valid'], (string)$vector['value']);
                $this->assertStringContainsString('defaultgrade', $error->getMessage());
            }
        }
        try {
            xml_validator::prepare('<quiz><question type="category"><category/></question></quiz>', 1);
            $this->fail('Malformed marker was accepted.');
        } catch (\moodle_exception $error) {
            $this->assertSame('invalidxml', $error->errorcode);
            $this->assertStringContainsString('category[1]', $error->getMessage());
            $this->assertStringNotContainsString('Question 1', $error->getMessage());
        }
    }
}
