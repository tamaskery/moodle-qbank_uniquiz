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
 * Import one validated batch with an outer database transaction.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class importer {
    /**
     * Validate and import a complete batch as one request-owned transaction.
     *
     * @param string $xml
     * @param int $count
     * @param \stdClass $category Checked by access::category.
     * @param \stdClass $course
     * @return int[] Question ids.
     */
    public static function run(string $xml, int $count, \stdClass $category, \stdClass $course): array {
        global $CFG, $DB;
        // This service owns a complete request-level transaction, never a caller's work.
        $DB->transactions_forbidden();
        require_capability('moodle/question:add', $category->context);
        // Bound work and request extra resources using Moodle's supported helpers.
        // Reverse-proxy limits still apply; retain the conservative 500-question cap.
        \core_php_time_limit::raise(120);
        raise_memory_limit(MEMORY_EXTRA);
        [$xml, $count] = xml_validator::prepare($xml, $count);
        require_once($CFG->dirroot . '/question/format.php');
        require_once($CFG->dirroot . '/question/format/xml/format.php');
        $filename = make_request_directory() . '/uniquiz.xml';
        if (file_put_contents($filename, $xml) === false) {
            throw new \moodle_exception('importfailed', 'qbank_uniquiz');
        }
        $format = new \qformat_xml();
        $format->setContexts([$category->context]);
        $format->setCourse($course);
        $format->setCategory($category);
        $format->setFilename($filename);
        $format->setRealfilename('uniquiz.xml');
        $format->setMatchgrades('error');
        $format->setCatfromfile(false);
        $format->setContextfromfile(false);
        $format->setStoponerror(true);
        $format->set_display_progress(false);
        $transaction = $DB->start_delegated_transaction();
        ob_start();
        try {
            if (
                !$format->importpreprocess() || !$format->importprocess() || !$format->importpostprocess() ||
                    count($format->questionids) !== $count || $format->importerrors
            ) {
                throw new \moodle_exception('importfailed', 'qbank_uniquiz');
            }
            \core\event\questions_imported::create([
                'contextid' => $category->contextid,
                'other' => ['format' => 'xml', 'categoryid' => $category->id],
            ])->trigger();
            $transaction->allow_commit();
            return $format->questionids;
        } catch (\Throwable $error) {
            // Core can throw with an inner delegated transaction still on the stack.
            // As the request's exception handler, unwind the entire batch immediately.
            $DB->force_transaction_rollback();
            throw $error;
        } finally {
            ob_end_clean();
            // Core request-directory cleanup is a fallback if the PHP process is interrupted.
            if (is_file($filename)) {
                unlink($filename);
            }
        }
    }
}
