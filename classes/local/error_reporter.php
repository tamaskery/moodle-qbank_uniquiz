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
 * Safe JSON errors and content-free server diagnostics.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class error_reporter {
    /**
     * Describe the failure without message, debuginfo, arguments, XML or user identifiers.
     * @param \Throwable $error Failure to identify.
     * @param string $reference Public correlation reference.
     * @return string JSON suitable for the server error log.
     */
    public static function log_record(\Throwable $error, string $reference): string {
        return json_encode([
            'component' => 'qbank_uniquiz', 'reference' => $reference,
            'exception' => get_class($error),
            'errorcode' => $error instanceof \moodle_exception ? $error->errorcode : (string)$error->getCode(),
            'file' => basename($error->getFile()), 'line' => $error->getLine(),
            'frames' => array_map(static fn($frame) => [
                'file' => basename($frame['file'] ?? ''), 'line' => $frame['line'] ?? null,
                'class' => $frame['class'] ?? '', 'function' => $frame['function'] ?? '',
            ], array_slice($error->getTrace(), 0, 6)),
        ]);
    }

    /**
     * Map validation errors to 422 and unexpected failures to 500 with a log reference.
     * @param \Throwable $error Import failure.
     * @return array HTTP status and response data.
     */
    public static function response(\Throwable $error): array {
        if (
            $error instanceof \moodle_exception && $error->module === 'qbank_uniquiz' &&
                in_array($error->errorcode, ['invalidxml', 'invalidxmlquestion', 'batchlimit'], true)
        ) {
            return [422, ['success' => false, 'message' => $error->getMessage()]];
        }
        $reference = bin2hex(random_bytes(8));
        // Keep content-free incident references available with Moodle debugging disabled.
        // phpcs:ignore moodle.PHP.ForbiddenFunctions.FoundWithAlternative
        error_log(self::log_record($error, $reference));
        return [500, ['success' => false, 'reference' => $reference,
            'message' => get_string('importfailedreference', 'qbank_uniquiz', $reference)]];
    }
}
