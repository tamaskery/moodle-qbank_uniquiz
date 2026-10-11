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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle. If not, see <https://www.gnu.org/licenses/>.

namespace qbank_uniquiz\local;

/**
 * Bounded session receipts and retry budgets without silent live-token eviction.
 * Calls must run while Moodle retains the session lock.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class receipts {
    /** Receipt lifetime, including completed retries. */
    public const LIFETIME = 86400;
    /** Hard capacity; unexpired receipts are never silently evicted. */
    public const MAX_RECEIPTS = 200;
    /** Retry budget window, resetting automatically after ten minutes. */
    public const WINDOW = 600;
    /** Attempts on one token per window; successful replay does not count. */
    public const TOKEN_ATTEMPTS = 20;
    /** Attempts across fresh tokens in the same session per window. */
    public const SESSION_ATTEMPTS = 50;

    /**
     * Remove only expired entries, preserving token keys and successful retry hashes.
     * @param array $entries Existing session receipts
     * @param int $now Current Unix timestamp
     * @return array Unexpired receipts
     */
    public static function prune(array $entries, int $now): array {
        return array_filter($entries, static fn($entry) => ($entry['created'] ?? 0) > $now - self::LIFETIME);
    }

    /**
     * Issue an independent context-bound token without evicting a live tab.
     * @param array $entries Session receipts updated in place
     * @param array $contextparams Authorized page context parameters
     * @param int $now Current Unix timestamp
     * @return string Random token
     */
    public static function issue(array &$entries, array $contextparams, int $now): string {
        $entries = self::prune($entries, $now);
        if (count($entries) >= self::MAX_RECEIPTS) {
            throw new \moodle_exception('receiptcapacity', 'qbank_uniquiz');
        }
        $token = bin2hex(random_bytes(24));
        $entries[$token] = ['created' => $now, 'contextparams' => $contextparams];
        return $token;
    }

    /**
     * Count an authorized attempt, keeping successful replay outside this budget.
     * These session-wide counts survive issuing new wizard tokens.
     * @param array $receipt Current uncompleted token updated in place
     * @param array $budget Session work budget updated in place
     * @param int $now Current Unix timestamp
     * @throws \moodle_exception When a temporary retry budget is exhausted
     */
    public static function attempt(array &$receipt, array &$budget, int $now): void {
        foreach (['token', 'session'] as $kind) {
            $counter = $kind === 'token' ? ($receipt['budget'] ?? []) : $budget;
            if (($counter['start'] ?? 0) <= $now - self::WINDOW) {
                $counter = ['start' => $now, 'attempts' => 0];
            }
            $limit = $kind === 'token' ? self::TOKEN_ATTEMPTS : self::SESSION_ATTEMPTS;
            if (($counter['attempts'] ?? 0) >= $limit) {
                $seconds = max(1, $counter['start'] + self::WINDOW - $now);
                throw new \moodle_exception('importretrylimit', 'qbank_uniquiz', '', $seconds);
            }
        }
        $receipt['budget'] = self::increment($receipt['budget'] ?? [], $now);
        $budget = self::increment($budget, $now);
    }

    /**
     * Increment a counter, restarting an expired window.
     * @param array $counter Previous counter
     * @param int $now Current Unix timestamp
     * @return array Updated counter
     */
    private static function increment(array $counter, int $now): array {
        if (($counter['start'] ?? 0) <= $now - self::WINDOW) {
            $counter = ['start' => $now, 'attempts' => 0];
        }
        $counter['attempts'] = ($counter['attempts'] ?? 0) + 1;
        return $counter;
    }
}
