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

use qbank_uniquiz\local\receipts;
use qbank_uniquiz\local\error_reporter;

#[\PHPUnit\Framework\Attributes\CoversClass(receipts::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(error_reporter::class)]
/**
 * Live-tab preservation, expiry and session-wide retry budgets.
 * @covers \qbank_uniquiz\local\receipts
 * @covers \qbank_uniquiz\local\error_reporter
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class receipts_test extends \advanced_testcase {
    /**
     * Opening more than 50 tabs never removes an existing live or completed receipt.
     */
    public function test_capacity_preserves_live_tokens_and_expiry(): void {
        $now = 1000000;
        $entries = [];
        $first = receipts::issue($entries, ['courseid' => 1], $now);
        $entries[$first]['hash'] = 'completed';
        $second = receipts::issue($entries, ['courseid' => 1], $now);
        for ($i = 2; $i < receipts::MAX_RECEIPTS; $i++) {
            receipts::issue($entries, ['courseid' => 1], $now);
        }
        $this->assertCount(receipts::MAX_RECEIPTS, $entries);
        $before = $entries;
        try {
            receipts::issue($entries, ['courseid' => 1], $now);
            $this->fail('Hard capacity was bypassed.');
        } catch (\moodle_exception $error) {
            $this->assertSame('receiptcapacity', $error->errorcode);
        }
        $this->assertSame($before, $entries);
        $this->assertSame('completed', $entries[$first]['hash']);
        $this->assertArrayHasKey($second, $entries);
        receipts::issue($entries, ['courseid' => 1], $now + receipts::LIFETIME);
        $this->assertCount(1, $entries);
    }

    /**
     * Failed-token retries stop temporarily and recover without losing the draft.
     */
    public function test_token_retry_budget_and_recovery(): void {
        $receipt = ['created' => 1000000, 'contextparams' => ['courseid' => 1]];
        $budget = [];
        for ($i = 0; $i < receipts::TOKEN_ATTEMPTS; $i++) {
            receipts::attempt($receipt, $budget, 1000000);
        }
        try {
            receipts::attempt($receipt, $budget, 1000001);
            $this->fail('Token budget was bypassed.');
        } catch (\moodle_exception $error) {
            [$status, $response] = error_reporter::response($error);
            $this->assertSame(429, $status);
            $this->assertSame(599, $response['retryafter']);
            $this->assertArrayNotHasKey('reference', $response);
        }
        receipts::attempt($receipt, $budget, 1000000 + receipts::WINDOW);
        $this->assertSame(1, $receipt['budget']['attempts']);
        $this->assertSame(['courseid' => 1], $receipt['contextparams']);
    }

    /**
     * Fresh tokens cannot bypass the session-wide attempt budget.
     */
    public function test_session_budget_survives_new_tokens(): void {
        $budget = [];
        for ($i = 0; $i < receipts::SESSION_ATTEMPTS; $i++) {
            $receipt = ['created' => 1000000];
            receipts::attempt($receipt, $budget, 1000000);
        }
        $this->expectException(\moodle_exception::class);
        $receipt = ['created' => 1000000];
        receipts::attempt($receipt, $budget, 1000000);
    }
}
