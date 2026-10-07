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
/**
 * Question bank navigation item.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class navigation extends \core_question\local\bank\navigation_node_base {
    /**
     * Return the translated navigation title.
     * @return string
     */
    public function get_navigation_title(): string {
        return get_string('pluginname', 'qbank_uniquiz');
    }
    /**
     * Return the stable navigation key.
     * @return string
     */
    public function get_navigation_key(): string {
        return 'uniquiz';
    }
    /**
     * Return the wizard URL.
     * @return \moodle_url
     */
    public function get_navigation_url(): \moodle_url {
        return new \moodle_url('/question/bank/uniquiz/index.php');
    }
    /**
     * Return capabilities needed to see this navigation entry.
     * @return array|null
     */
    public function get_navigation_capabilities(): ?array {
        return ['moodle/question:add'];
    }
}
