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

use qbank_uniquiz\local\error_reporter;
use qbank_uniquiz\local\xml_validator;

#[\PHPUnit\Framework\Attributes\CoversClass(xml_validator::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(error_reporter::class)]
/**
 * Validation and error-reporting regression tests.
 * @covers \qbank_uniquiz\local\xml_validator
 * @covers \qbank_uniquiz\local\error_reporter
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class validator_test extends \advanced_testcase {
    /**
     * A minimal valid question.
     * @return string
     */
    private function question(): string {
        return '<question type="description"><name><text>Example</text></name>' .
            '<questiontext format="html"><text>a&amp;lt;b &amp;amp; c&lt;br&gt;Next line</text></questiontext>' .
            '<defaultgrade>0</defaultgrade></question>';
    }

    /**
     * Sanitization retains literal text encoded as HTML.
     */
    public function test_literal_text_survives(): void {
        [$xml, $count] = xml_validator::prepare('<quiz>' . $this->question() . '</quiz>', 1);
        $doc = new \DOMDocument();
        $doc->loadXML($xml);
        $text = $doc->getElementsByTagName('questiontext')->item(0)->textContent;
        $this->assertSame(1, $count);
        $this->assertStringContainsString('a&lt;b &amp; c', $text);
        $this->assertMatchesRegularExpression('~<br\s*/?>Next line~', $text);
    }

    /**
     * Attack envelopes and data-changing tags are rejected.
     */
    public function test_rejected_envelopes(): void {
        $q = $this->question();
        foreach (
            [
            '<!DOCTYPE quiz><quiz>' . $q . '</quiz>',
            '<!DOCTYPE quiz [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><quiz>' . $q . '</quiz>',
            '<!DOCTYPE quiz [<!ENTITY % remote SYSTEM "https://example.invalid/xxe">%remote;]><quiz>' . $q . '</quiz>',
            '<!DOCTYPE quiz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><quiz>' . $q . '</quiz>',
            mb_convert_encoding('<?xml version="1.0" encoding="UTF-16"?><quiz>' . $q . '</quiz>', 'UTF-16', 'UTF-8'),
            '<?xml version="1.0" encoding="ISO-8859-1"?><quiz>' . $q . '</quiz>',
            '<quiz>' . str_repeat('<x>', 300) . str_repeat('</x>', 300) . '</quiz>',
            '<quiz>' . str_replace('Example', "Bad\0text", $q) . '</quiz>',
            '<quiz><!--comment-->' . $q . '</quiz>',
            '<?test data?><quiz>' . $q . '</quiz>',
            '<quiz xmlns="urn:bad">' . str_replace('<question ', '<question xmlns="" ', $q) . '</quiz>',
            '<quiz>' . str_replace('</question>', '<file>abc</file></question>', $q) . '</quiz>',
            '<quiz>' . str_replace('</question>', '<tags><tag><text>' . str_repeat('x', 256) .
                '</text></tag></tags></question>', $q) . '</quiz>',
            '<quiz>' . str_replace('</question>', '<defaultgrade>0</defaultgrade></question>', $q) . '</quiz>',
            ] as $xml
        ) {
            try {
                xml_validator::prepare($xml, 1);
                $this->fail('Invalid envelope was accepted.');
            } catch (\moodle_exception $error) {
                $this->assertContains($error->errorcode, ['invalidxml', 'invalidxmlquestion']);
            }
        }
    }

    /**
     * Purification protects every accepted HTML-bearing field in the description envelope.
     */
    public function test_html_is_not_trusted(): void {
        $payload = '<script>alert(1)</script><img src="x" onerror="alert(2)">' .
            '<a href="javascript:alert(3)">link</a><svg onload="alert(4)"></svg><b>Kept</b>';
        $q = preg_replace(
            '~<questiontext.*?</questiontext>~s',
            '<questiontext format="html"><text><![CDATA[' . $payload . ']]></text></questiontext>',
            $this->question()
        );
        [$xml] = xml_validator::prepare('<quiz>' . $q . '</quiz>', 1);
        $doc = new \DOMDocument();
        $doc->loadXML($xml);
        $text = $doc->getElementsByTagName('questiontext')->item(0)->textContent;
        foreach (['<script', 'onerror', 'javascript:', '<svg', 'onload'] as $unsafe) {
            $this->assertStringNotContainsString($unsafe, strtolower($text));
        }
        $this->assertStringContainsString('<b>Kept</b>', $text);
    }

    /**
     * Small question counts cannot bypass independent work limits.
     */
    public function test_complexity_limits(): void {
        $tag = '<tag><text>safe</text></tag>';
        $answer = '<answer fraction="100" format="html"><text>ok</text></answer>';
        $short = str_replace(
            ['type="description"', '<defaultgrade>0</defaultgrade>'],
            ['type="shortanswer"', '<defaultgrade>1</defaultgrade><usecase>0</usecase>'],
            $this->question()
        );
        $withtags = fn($n) => str_replace('</question>', '<tags>' . str_repeat($tag, $n) . '</tags></question>', $this->question());
        $withanswers = fn($n) => str_replace('</question>', str_repeat($answer, $n) . '</question>', $short);
        foreach (
            [[$withtags(101), 1], [$withanswers(101), 1],
            [str_repeat($withtags(100), 51), 51], [str_repeat($withanswers(100), 51), 51],
            [str_replace('Example', str_repeat('x', xml_validator::MAX_FIELD_BYTES + 1), $this->question()), 1],
            [str_repeat('<x/>', xml_validator::MAX_ELEMENTS + 1), 1],
            [str_repeat('<x/>', xml_validator::MAX_ELEMENTS * 2 + 2), 1],
            [str_repeat('<question type="category"><category><text>x</text></category></question>', 501) .
                $this->question(), 1]] as [$body, $count]
        ) {
            try {
                xml_validator::prepare('<quiz>' . $body . '</quiz>', $count);
                $this->fail('Resource limit was bypassed.');
            } catch (\moodle_exception $error) {
                $this->assertContains($error->errorcode, ['invalidxml', 'invalidxmlquestion']);
            }
        }
        foreach ([$withtags(100), $withanswers(100)] as $body) {
            [, $count] = xml_validator::prepare('<quiz>' . $body . '</quiz>', 1);
            $this->assertSame(1, $count);
        }
    }

    /**
     * Failures identify the question and field without disclosing source content.
     */
    public function test_question_location_and_http_status(): void {
        $bad = str_replace('<defaultgrade>0</defaultgrade>', '<defaultgrade>SECRET</defaultgrade>', $this->question());
        try {
            xml_validator::prepare('<quiz>' . $this->question() . $bad . '</quiz>', 2);
            $this->fail('Invalid grade was accepted.');
        } catch (\moodle_exception $error) {
            [$status, $response] = error_reporter::response($error);
            $this->assertSame(422, $status);
            $this->assertStringContainsString('Question 2, defaultgrade', $response['message']);
            $this->assertStringNotContainsString('SECRET', $response['message']);
        }
    }

    /**
     * The limit applies to both the request count and actual XML questions.
     */
    public function test_batch_limit(): void {
        foreach ([1, 501] as $count) {
            try {
                xml_validator::prepare('<quiz>' . str_repeat($this->question(), 501) . '</quiz>', $count);
                $this->fail('Oversized batch was accepted.');
            } catch (\moodle_exception $error) {
                $this->assertSame('batchlimit', $error->errorcode);
            }
        }
        [, $count] = xml_validator::prepare('<quiz>' . str_repeat($this->question(), 500) . '</quiz>', 500);
        $this->assertSame(500, $count);
    }

    /**
     * Error logs contain a reference and diagnostic location, not submitted content.
     */
    public function test_log_redaction(): void {
        $error = new \moodle_exception('importfailed', 'qbank_uniquiz', '', 'SECRET', 'SQL SECRET');
        $record = error_reporter::log_record($error, 'reference123');
        $this->assertStringNotContainsString('SECRET', $record);
        $this->assertStringContainsString('reference123', $record);
        $this->assertStringContainsString('importfailed', $record);
        $this->assertArrayHasKey('line', json_decode($record, true));
        foreach (json_decode($record, true)['frames'] as $frame) {
            $this->assertArrayNotHasKey('args', $frame);
        }
    }

    /**
     * Purification/XML escaping must not expand a small request beyond the core-import limit.
     */
    public function test_sanitized_size_limit(): void {
        $q = preg_replace(
            '~<questiontext.*?</questiontext>~s',
            '<questiontext format="html"><text><![CDATA[' . str_repeat('&', xml_validator::MAX_FIELD_BYTES) .
                ']]></text></questiontext>',
            $this->question()
        );
        $xml = '<quiz>' . str_repeat($q, 4) . '</quiz>';
        $this->assertLessThan(xml_validator::MAX_BYTES, strlen($xml));
        $this->expectException(\moodle_exception::class);
        $this->expectExceptionMessage(get_string('xmltoolarge', 'qbank_uniquiz'));
        xml_validator::prepare($xml, 4);
    }
}
