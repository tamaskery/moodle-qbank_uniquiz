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

namespace qbank_uniquiz\local;
/**
 * Explicitly constrain destinations to the current question-bank contexts.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class access {
    /**
     * Check a destination, including its real context, not a client-supplied context id.
     * @param int $categoryid
     * @param array $contexts
     * @return \stdClass
     */
    public static function category(int $categoryid, array $contexts): \stdClass {
        global $DB;
        $category = $DB->get_record('question_categories', ['id' => $categoryid], '*', MUST_EXIST);
        $contextids = array_map(static fn($context) => (int)$context->id, $contexts);
        if (!$category->parent || !in_array((int)$category->contextid, $contextids, true)) {
            throw new \moodle_exception('invalidrequest', 'qbank_uniquiz');
        }
        $category->context = \context::instance_by_id($category->contextid);
        require_capability('moodle/question:add', $category->context);
        return $category;
    }
}
