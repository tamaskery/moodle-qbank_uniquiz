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
 * Deliberate plugin grading limits shared with browser validation fixtures.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class grading {
    /** Smallest non-zero mark representable in Moodle's seven-decimal field. */
    public const MIN_MARK = 0.0000001;
    /** Product limit comfortably below Moodle's database ceiling. */
    public const MAX_MARK = 10000;
    /** Units per XML percentage point, not units per stored proportion. */
    public const XML_PERCENTAGE_SCALE = 10000000;
    /** Inclusive 0.0001 percentage-point allowance. */
    public const TOTAL_ALLOWANCE = 1000;

    /**
     * Sum positive XML percentages as integers after seven-place rounding.
     * Only non-negative contributions are rounded: PHP half-up and JS Math.round agree.
     * Bounds on fractions and answers keep sums well within exact integer ranges.
     * @param float[] $fractions Validated percentages in the range -100 to 100
     * @return bool Whether the positive total is within the inclusive allowance
     */
    public static function valid_total(array $fractions): bool {
        $units = 0;
        foreach ($fractions as $fraction) {
            if ($fraction > 0) {
                $units += (int)round($fraction * self::XML_PERCENTAGE_SCALE, 0, PHP_ROUND_HALF_UP);
            }
        }
        return abs($units - 100 * self::XML_PERCENTAGE_SCALE) <= self::TOTAL_ALLOWANCE;
    }
}
