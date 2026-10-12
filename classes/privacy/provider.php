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

namespace qbank_uniquiz\privacy;

use core_privacy\local\metadata\collection;

/**
 * Declare question and logging subsystems used by confirmed imports.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class provider implements \core_privacy\local\metadata\provider {
    /**
     * Describe personal data stored by core on behalf of this plugin.
     * @param \core_privacy\local\metadata\collection $items Metadata collection
     * @return \core_privacy\local\metadata\collection Updated metadata
     */
    public static function get_metadata(collection $items): collection {
        $items->add_subsystem_link('core_question', [], 'privacy:metadata:core_question');
        $items->add_subsystem_link('core_log', [], 'privacy:metadata:core_log');
        return $items;
    }
}
