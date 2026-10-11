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
 * Bounded category search within the current authorized question-bank contexts.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class categories {
    /** @var int Maximum results on each page. */
    public const PAGE_SIZE = 50;

    /**
     * Fetch one page, escaping search wildcards and resolving only displayed ancestors.
     * @param array $contexts Candidate contexts; capability is rechecked here
     * @param string $search Category-name search
     * @param int $page Zero-based page
     * @return array Category labels and pagination state
     */
    public static function search(array $contexts, string $search = '', int $page = 0): array {
        global $DB;
        $ids = [];
        foreach ($contexts as $context) {
            if (has_capability('moodle/question:add', $context)) {
                $ids[] = (int)$context->id;
            }
        }
        if (!$ids) {
            return ['categories' => [], 'more' => false, 'page' => 0];
        }
        $page = max(0, min($page, 10000));
        [$insql, $params] = $DB->get_in_or_equal($ids, SQL_PARAMS_NAMED);
        $where = "contextid $insql AND parent <> 0";
        $search = \core_text::substr(trim($search), 0, 255);
        if ($search !== '') {
            $where .= ' AND ' . $DB->sql_like('name', ':search', false);
            $params['search'] = '%' . $DB->sql_like_escape($search) . '%';
        }
        $records = array_values($DB->get_records_select('question_categories', $where, $params,
            'contextid, name, id', '*', $page * self::PAGE_SIZE, self::PAGE_SIZE + 1));
        $more = count($records) > self::PAGE_SIZE;
        $records = array_slice($records, 0, self::PAGE_SIZE);
        $cache = [];
        $items = [];
        foreach ($records as $record) {
            $items[] = ['id' => (int)$record->id, 'name' => self::label($record, $cache)];
        }
        return ['categories' => $items, 'more' => $more, 'page' => $page];
    }

    /**
     * Plain-text hierarchy label, with bounded traversal and same-context ancestors.
     * @param \stdClass $record Category
     * @param array $cache Parent records already fetched
     * @return string
     */
    public static function label(\stdClass $record, array &$cache): string {
        global $DB;
        $parts = [$record->name];
        $parent = (int)$record->parent;
        $seen = [(int)$record->id];
        while ($parent && count($seen) < 100 && !in_array($parent, $seen, true)) {
            $seen[] = $parent;
            if (!array_key_exists($parent, $cache)) {
                $cache[$parent] = $DB->get_record('question_categories',
                    ['id' => $parent, 'contextid' => $record->contextid]);
            }
            $ancestor = $cache[$parent];
            if (!$ancestor || !$ancestor->parent) {
                break;
            }
            array_unshift($parts, $ancestor->name);
            $parent = (int)$ancestor->parent;
        }
        $context = \context::instance_by_id($record->contextid);
        return strip_tags($context->get_context_name(false)) . ' / ' . implode(' / ', $parts);
    }
}
