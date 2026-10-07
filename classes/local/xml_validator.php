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
 * Validate the restricted UniQuiz XML envelope independently of browser checks.
 * Files, embedded resources, foreign contexts and unsupported question types are rejected.
 * @package qbank_uniquiz
 * @copyright 2026 Tamas Kery
 * @license http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class xml_validator {
    /** Maximum generated XML size (source input has a separate 5 MB browser limit). */
    public const MAX_BYTES = 8388608;
    /** Bounded per-request work. */
    public const MAX_QUESTIONS = 500;
    /** Bound XML structure and repeated database work independently of question count. */
    public const MAX_ELEMENTS = 50000;
    /** Maximum answers or tags on one question. */
    public const MAX_ITEMS_PER_QUESTION = 100;
    /** Maximum answers or tags across a batch (each counted separately). */
    public const MAX_ITEMS_PER_BATCH = 5000;
    /** Bound individual text fields before HTML purification. */
    public const MAX_FIELD_BYTES = 262144;

    /** @var int Current question, zero for a document-level failure. */
    private static int $question = 0;
    /** @var string Safe structural field identifier, never question content. */
    private static string $field = 'document';

    /**
     * Reject invalid input with safe location details.
     * @return never
     */
    private static function reject(string $reason = 'xmlstructure'): void {
        $details = (object)[
            'question' => self::$question,
            'field' => self::$field,
            'reason' => get_string($reason, 'qbank_uniquiz'),
        ];
        throw new \moodle_exception(self::$question ? 'invalidxmlquestion' : 'invalidxml', 'qbank_uniquiz', '', $details);
    }

    /**
     * Validate child elements and reject duplicate singleton fields.
     * @return \DOMElement[]
     */
    private static function children(\DOMElement $node, array $allowed, array $repeated = []): array {
        $result = [];
        $seen = [];
        foreach ($node->childNodes as $child) {
            if ($child instanceof \DOMText && trim($child->textContent) === '') {
                continue;
            }
            if (!$child instanceof \DOMElement || $child->namespaceURI || !in_array($child->tagName, $allowed, true)) {
                self::reject();
            }
            if (isset($seen[$child->tagName]) && !in_array($child->tagName, $repeated, true)) {
                self::reject();
            }
            $seen[$child->tagName] = true;
            $result[] = $child;
        }
        return $result;
    }

    /**
     * Check attributes without accepting namespace or resource injection.
     */
    private static function attributes(\DOMElement $node, array $allowed = []): void {
        foreach ($node->attributes as $attribute) {
            if (!in_array($attribute->name, $allowed, true)) {
                self::reject();
            }
        }
    }

    /**
     * Read a scalar text value without nested markup.
     * @return string
     */
    private static function scalar(\DOMElement $node): string {
        self::attributes($node);
        foreach ($node->childNodes as $child) {
            if (!$child instanceof \DOMText && !$child instanceof \DOMCdataSection) {
                self::reject();
            }
        }
        $value = $node->textContent;
        if (strlen($value) > self::MAX_FIELD_BYTES) {
            self::reject('xmlfieldlimit');
        }
        return $value;
    }

    /**
     * Read text and sanitize HTML when appropriate.
     * @return string
     */
    private static function text(\DOMElement $node, bool $html = false): string {
        self::attributes($node, $html ? ['format'] : []);
        if ($html && $node->getAttribute('format') !== 'html') {
            self::reject();
        }
        $children = self::children($node, ['text']);
        if (count($children) !== 1) {
            self::reject();
        }
        $value = self::scalar($children[0]);
        if ($html) {
            // Imported content is never trusted merely because the client generated it.
            $value = clean_text($value, FORMAT_HTML);
            $children[0]->textContent = $value;
        }
        return $value;
    }

    /**
     * Parse a finite numeric value.
     * @return float
     */
    private static function number(string $value): float {
        if (!preg_match('/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/D', trim($value))) {
            self::reject('xmlnumber');
        }
        $number = (float)$value;
        if (!is_finite($number)) {
            self::reject('xmlnumber');
        }
        return $number;
    }

    /**
     * Validate, sanitize HTML and remove category markers.
     * @return array [XML, count]
     */
    public static function prepare(string $xml, int $expected): array {
        self::$question = 0;
        self::$field = 'document';
        if ($expected > self::MAX_QUESTIONS) {
            throw new \moodle_exception('batchlimit', 'qbank_uniquiz', '', self::MAX_QUESTIONS);
        }
        if (
            $xml === '' || strlen($xml) > self::MAX_BYTES || $expected < 1 ||
                preg_match('/<!DOCTYPE|<!ENTITY/i', $xml)
        ) {
            self::reject();
        }
        // The browser exports UTF-8. Reject alternate encodings before inspecting XML syntax.
        if (str_contains($xml, "\0") || !preg_match('//u', $xml)) {
            self::reject('xmlencoding');
        }
        // Cheap lexical guard before allocating DOM nodes, including rejected comments/CDATA.
        // A supported document needs at most two markup starts per element plus its declaration.
        if (substr_count($xml, '<') > self::MAX_ELEMENTS * 2 + 1) {
            self::reject('xmlcomplexity');
        }
        $previous = libxml_use_internal_errors(true);
        try {
            $document = new \DOMDocument();
            $document->resolveExternals = false;
            $document->substituteEntities = false;
            $valid = $document->loadXML($xml, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        if (
            !$valid || $document->doctype || $document->documentElement->tagName !== 'quiz' ||
                $document->documentElement->namespaceURI
        ) {
            self::reject('xmlmalformed');
        }
        if ($document->encoding && strcasecmp($document->encoding, 'UTF-8') !== 0) {
            self::reject('xmlencoding');
        }
        if ($document->getElementsByTagName('*')->length > self::MAX_ELEMENTS) {
            self::reject('xmlcomplexity');
        }
        // No document-level comments or processing instructions either.
        foreach ($document->childNodes as $node) {
            if ($node !== $document->documentElement) {
                self::reject('xmlstructure');
            }
        }
        $root = $document->documentElement;
        self::attributes($root);
        $questions = self::children($root, ['question'], ['question']);
        $count = 0;
        $totalanswers = 0;
        $totaltags = 0;
        $markerscount = 0;
        foreach ($questions as $question) {
            self::$question = $count + 1;
            self::$field = 'question';
            self::attributes($question, ['type']);
            $type = $question->getAttribute('type');
            if ($type === 'category') {
                if (++$markerscount > self::MAX_QUESTIONS) {
                    self::reject('xmlcomplexity');
                }
                $markers = self::children($question, ['category']);
                if (count($markers) !== 1) {
                    self::reject();
                }
                self::text($markers[0]);
                $root->removeChild($question);
                continue;
            }
            if (!in_array($type, ['multichoice', 'truefalse', 'shortanswer', 'numerical', 'essay', 'description'], true)) {
                self::reject();
            }
            $count++;
            if ($count > self::MAX_QUESTIONS) {
                throw new \moodle_exception('batchlimit', 'qbank_uniquiz', '', self::MAX_QUESTIONS);
            }
            $common = ['name', 'questiontext', 'generalfeedback', 'defaultgrade', 'penalty', 'hidden', 'idnumber', 'tags'];
            $extra = [
                'multichoice' => ['single', 'shuffleanswers', 'answernumbering', 'answer',
                    'correctfeedback', 'partiallycorrectfeedback', 'incorrectfeedback'],
                'truefalse' => ['answer'], 'shortanswer' => ['usecase', 'answer'], 'numerical' => ['answer'],
                'essay' => ['responseformat', 'responserequired', 'responsefieldlines', 'attachments',
                    'attachmentsrequired', 'graderinfo', 'responsetemplate'], 'description' => [],
            ];
            $fields = [];
            $answers = [];
            foreach (self::children($question, array_merge($common, $extra[$type]), ['answer']) as $field) {
                self::$field = $field->tagName;
                if ($field->tagName === 'answer') {
                    self::$field = 'answer[' . (count($answers) + 1) . ']';
                    if (count($answers) >= self::MAX_ITEMS_PER_QUESTION || ++$totalanswers > self::MAX_ITEMS_PER_BATCH) {
                        self::reject('xmlcomplexity');
                    }
                    self::attributes($field, ['fraction', 'format']);
                    if ($field->getAttribute('format') !== 'html') {
                        self::reject();
                    }
                    $fraction = self::number($field->getAttribute('fraction'));
                    if ($fraction < -100 || $fraction > 100) {
                        self::reject();
                    }
                    $answer = ['fraction' => $fraction];
                    $allowed = $type === 'numerical' ? ['text', 'feedback', 'tolerance'] : ['text', 'feedback'];
                    foreach (self::children($field, $allowed) as $part) {
                        self::$field = 'answer[' . (count($answers) + 1) . '].' . $part->tagName;
                        $answer[$part->tagName] = $part->tagName === 'feedback' ? self::text($part, true) : self::scalar($part);
                        if ($part->tagName === 'text' && $type === 'multichoice') {
                            $answer['text'] = clean_text($answer['text'], FORMAT_HTML);
                            $part->textContent = $answer['text'];
                        }
                    }
                    self::$field = 'answer[' . (count($answers) + 1) . '].text';
                    if (trim($answer['text'] ?? '') === '') {
                        self::reject();
                    }
                    if ($type === 'numerical') {
                        self::number($answer['text']);
                        self::$field = 'answer[' . (count($answers) + 1) . '].tolerance';
                        if (self::number($answer['tolerance'] ?? '0') < 0) {
                            self::reject();
                        }
                    }
                    $answers[] = $answer;
                } else if ($field->tagName === 'tags') {
                    self::attributes($field);
                    $tags = self::children($field, ['tag'], ['tag']);
                    $totaltags += count($tags);
                    if (count($tags) > self::MAX_ITEMS_PER_QUESTION || $totaltags > self::MAX_ITEMS_PER_BATCH) {
                        self::reject('xmlcomplexity');
                    }
                    foreach ($tags as $tag) {
                        $value = self::text($tag);
                        if ($value === '' || $value !== clean_param($value, PARAM_TAG)) {
                            self::reject('xmltag');
                        }
                    }
                } else if ($field->tagName === 'name') {
                    $fields['name'] = self::text($field);
                } else if (
                    in_array($field->tagName, ['questiontext', 'generalfeedback', 'correctfeedback',
                        'partiallycorrectfeedback', 'incorrectfeedback', 'graderinfo', 'responsetemplate'], true)
                ) {
                    $fields[$field->tagName] = self::text($field, true);
                } else {
                    $fields[$field->tagName] = self::scalar($field);
                }
            }
            foreach (['name', 'questiontext'] as $requiredfield) {
                self::$field = $requiredfield;
                if (trim($fields[$requiredfield] ?? '') === '') {
                    self::reject();
                }
            }
            self::$field = 'name';
            if (\core_text::strlen($fields['name']) > 255) {
                self::reject('xmlnamelength');
            }
            self::$field = 'defaultgrade';
            $grade = self::number($fields['defaultgrade'] ?? '');
            if (($type === 'description' && $grade != 0) || ($type !== 'description' && $grade <= 0)) {
                self::reject();
            }
            self::$field = 'hidden/idnumber';
            if (($fields['hidden'] ?? '0') !== '0' || trim($fields['idnumber'] ?? '') !== '') {
                self::reject();
            }
            self::$field = 'penalty';
            $penalty = self::number($fields['penalty'] ?? '0');
            if ($penalty < 0 || $penalty > 1) {
                self::reject();
            }
            $fractions = array_column($answers, 'fraction');
            $positive = array_filter($fractions, static fn($value) => $value > 0);
            self::$field = 'grading/options';
            if ($type === 'multichoice') {
                if (
                    count($answers) < 2 || abs(array_sum($positive) - 100) > 0.0001 ||
                        !in_array($fields['single'] ?? '', ['true', 'false'], true) ||
                        !in_array($fields['shuffleanswers'] ?? '', ['0', '1'], true) ||
                        !in_array($fields['answernumbering'] ?? '', ['abc', 'ABCD', '123', 'none'], true) ||
                        ($fields['single'] === 'true' && count($positive) !== 1)
                ) {
                    self::reject();
                }
            } else if ($type === 'truefalse') {
                $texts = array_column($answers, 'text');
                sort($texts);
                sort($fractions);
                if ($texts !== ['false', 'true'] || $fractions !== [0.0, 100.0]) {
                    self::reject();
                }
            } else if (in_array($type, ['shortanswer', 'numerical'], true)) {
                if (
                    !in_array(100.0, $fractions, true) ||
                        ($type === 'shortanswer' && !in_array($fields['usecase'] ?? '', ['0', '1'], true))
                ) {
                    self::reject();
                }
            } else if ($type === 'essay') {
                $defaults = ['responseformat' => 'editor', 'responserequired' => '1', 'responsefieldlines' => '15',
                    'attachments' => '0', 'attachmentsrequired' => '0', 'graderinfo' => '', 'responsetemplate' => ''];
                foreach ($defaults as $key => $value) {
                    if (($fields[$key] ?? null) !== $value) {
                        self::reject();
                    }
                }
            }
        }
        if ($count !== $expected) {
            self::$question = 0;
            self::$field = 'count';
            self::reject('xmlcount');
        }
        $sanitized = $document->saveXML();
        // CDATA and HTML purification can expand escaping; also bound what core will parse.
        if (strlen($sanitized) > self::MAX_BYTES) {
            self::$question = 0;
            self::$field = 'document';
            self::reject('xmltoolarge');
        }
        return [$sanitized, $count];
    }
}
