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
 * Moodle language keys used by the generated UI.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class strings {
    /**
     * Discover stable generated keys from the English fallback catalogue.
     * @param string $prefix Key prefix.
     * @return string[]
     */
    public static function keys(string $prefix): array {
        $strings = get_string_manager()->load_component_strings('qbank_uniquiz', 'en');
        return array_values(array_filter(array_keys($strings), static fn($key) => str_starts_with($key, $prefix)));
    }

    /**
     * Plain strings, escaped by Mustache in text and attributes.
     * @return array
     */
    public static function template_context(): array {
        $result = [];
        foreach (self::keys('ui_') as $key) {
            $result[$key] = get_string($key, 'qbank_uniquiz');
        }
        return $result;
    }
}
