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

/**
 * UniQuiz version information.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
defined('MOODLE_INTERNAL') || die();
$plugin->component = 'qbank_uniquiz';
$plugin->version = 2026100701;
$plugin->requires = 2024100700;
// No inclusive supported range: 5.0 and 5.1 have not been verified.
// The QA summary lists the exact tested 4.5, 5.2 and 5.3 environments.
$plugin->maturity = MATURITY_BETA;
$plugin->release = '0.1.4';
$plugin->dependencies = ['qformat_xml' => ANY_VERSION];
