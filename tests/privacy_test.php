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

use qbank_uniquiz\privacy\provider;
use core_privacy\local\metadata\collection;

#[\PHPUnit\Framework\Attributes\CoversClass(provider::class)]
/**
 * Verify declarations for core-managed import data.
 * @covers \qbank_uniquiz\privacy\provider
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class privacy_test extends \advanced_testcase {
    /**
     * Check that both core subsystems are declared with resolvable descriptions.
     */
    public function test_metadata_declares_question_and_log_subsystems(): void {
        $items = new collection('qbank_uniquiz');
        $this->assertSame($items, provider::get_metadata($items));
        $metadata = $items->get_collection();
        $this->assertCount(2, $metadata);
        $this->assertSame(['core_question', 'core_log'], array_map(
            static fn($item) => $item->get_name(),
            $metadata
        ));
        foreach ($metadata as $item) {
            $this->assertInstanceOf(\core_privacy\local\metadata\types\subsystem_link::class, $item);
            $this->assertNotEmpty(get_string('privacy:metadata:' . $item->get_name(), 'qbank_uniquiz'));
        }
    }
}
