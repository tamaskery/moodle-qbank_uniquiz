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
    private int $question = 0;
    /** @var string Safe structural field identifier, never question content. */
    private string $field = 'document';

    /**
     * Reject invalid input with safe location details.
     * @param string $reason Language key explaining the rejection
     * @return never
     */
    private function reject(string $reason = 'xmlstructure'): void {
        $details = (object)[
            'question' => $this->question,
            'field' => $this->field,
            'reason' => get_string($reason, 'qbank_uniquiz'),
        ];
        throw new \moodle_exception($this->question ? 'invalidxmlquestion' : 'invalidxml', 'qbank_uniquiz', '', $details);
    }

    /**
     * Validate child elements and reject duplicate singleton fields.
     * @param \DOMElement $node Parent element
     * @param string[] $allowed Allowed child names
     * @param string[] $repeated Child names allowed more than once
     * @return \DOMElement[]
     */
    private function children(\DOMElement $node, array $allowed, array $repeated = []): array {
        $result = [];
        $seen = [];
        foreach ($node->childNodes as $child) {
            if ($child instanceof \DOMText && trim($child->textContent) === '') {
                continue;
            }
            if (!$child instanceof \DOMElement || $child->namespaceURI || !in_array($child->tagName, $allowed, true)) {
                $this->reject();
            }
            if (isset($seen[$child->tagName]) && !in_array($child->tagName, $repeated, true)) {
                $this->reject();
            }
            $seen[$child->tagName] = true;
            $result[] = $child;
        }
        return $result;
    }

    /**
     * Check attributes without accepting namespace or resource injection.
     * @param \DOMElement $node Element to validate
     * @param string[] $allowed Allowed attribute names
     */
    private function attributes(\DOMElement $node, array $allowed = []): void {
        foreach ($node->attributes as $attribute) {
            if (!in_array($attribute->name, $allowed, true)) {
                $this->reject();
            }
        }
    }

    /**
     * Read a scalar text value without nested markup.
     * @param \DOMElement $node Text container
     * @return string
     */
    private function scalar(\DOMElement $node): string {
        $this->attributes($node);
        foreach ($node->childNodes as $child) {
            if (!$child instanceof \DOMText && !$child instanceof \DOMCdataSection) {
                $this->reject();
            }
        }
        $value = $node->textContent;
        if (strlen($value) > self::MAX_FIELD_BYTES) {
            $this->reject('xmlfieldlimit');
        }
        return $value;
    }

    /**
     * Read text and sanitize HTML when appropriate.
     * @param \DOMElement $node Field containing a text element
     * @param bool $html Whether to sanitize HTML
     * @return string
     */
    private function text(\DOMElement $node, bool $html = false): string {
        $this->attributes($node, $html ? ['format'] : []);
        if ($html && $node->getAttribute('format') !== 'html') {
            $this->reject();
        }
        $children = $this->children($node, ['text']);
        if (count($children) !== 1) {
            $this->reject();
        }
        $value = $this->scalar($children[0]);
        if ($html) {
            // Imported content is never trusted merely because the client generated it.
            $value = clean_text($value, FORMAT_HTML);
            $children[0]->textContent = $value;
        }
        return $value;
    }

    /**
     * Parse a finite numeric value.
     * @param string $value Numeric source text
     * @return float
     */
    private function number(string $value): float {
        if (!preg_match('/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/D', trim($value))) {
            $this->reject('xmlnumber');
        }
        $number = (float)$value;
        if (!is_finite($number)) {
            $this->reject('xmlnumber');
        }
        return $number;
    }

    /**
     * Validate, sanitize HTML and remove category markers.
     * @param string $xml Submitted UTF-8 XML
     * @param int $expected Expected number of questions
     * @return array [XML, count]
     */
    public static function prepare(string $xml, int $expected): array {
        return (new self())->validate($xml, $expected);
    }

    /**
     * Validate using diagnostic state owned only by this invocation.
     * @param string $xml Submitted UTF-8 XML
     * @param int $expected Expected number of questions
     * @return array Sanitized XML and count
     */
    private function validate(string $xml, int $expected): array {
        $this->question = 0;
        $this->field = 'document';
        if ($expected > self::MAX_QUESTIONS) {
            throw new \moodle_exception('batchlimit', 'qbank_uniquiz', '', self::MAX_QUESTIONS);
        }
        if (
            $xml === '' || strlen($xml) > self::MAX_BYTES || $expected < 1 ||
                preg_match('/<!DOCTYPE|<!ENTITY/i', $xml)
        ) {
            $this->reject();
        }
        // The browser exports UTF-8. Reject alternate encodings before inspecting XML syntax.
        if (str_contains($xml, "\0") || !preg_match('//u', $xml)) {
            $this->reject('xmlencoding');
        }
        // Cheap lexical guard before allocating DOM nodes, including rejected comments/CDATA.
        // A supported document needs at most two markup starts per element plus its declaration.
        if (substr_count($xml, '<') > self::MAX_ELEMENTS * 2 + 1) {
            $this->reject('xmlcomplexity');
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
            $this->reject('xmlmalformed');
        }
        if ($document->encoding && strcasecmp($document->encoding, 'UTF-8') !== 0) {
            $this->reject('xmlencoding');
        }
        if ($document->getElementsByTagName('*')->length > self::MAX_ELEMENTS) {
            $this->reject('xmlcomplexity');
        }
        // No document-level comments or processing instructions either.
        foreach ($document->childNodes as $node) {
            if ($node !== $document->documentElement) {
                $this->reject('xmlstructure');
            }
        }
        $root = $document->documentElement;
        $this->attributes($root);
        $questions = $this->children($root, ['question'], ['question']);
        $count = 0;
        $totalanswers = 0;
        $totaltags = 0;
        $markerscount = 0;
        foreach ($questions as $question) {
            $type = $question->getAttribute('type');
            $this->question = $type === 'category' ? 0 : $count + 1;
            $this->field = $type === 'category' ? 'category[' . ($markerscount + 1) . ']' : 'question';
            $this->attributes($question, ['type']);
            if ($type === 'category') {
                if (++$markerscount > self::MAX_QUESTIONS) {
                    $this->reject('xmlcomplexity');
                }
                $markers = $this->children($question, ['category']);
                if (count($markers) !== 1) {
                    $this->reject();
                }
                $this->text($markers[0]);
                $root->removeChild($question);
                continue;
            }
            if (!in_array($type, ['multichoice', 'truefalse', 'shortanswer', 'numerical', 'essay', 'description'], true)) {
                $this->reject();
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
            foreach ($this->children($question, array_merge($common, $extra[$type]), ['answer']) as $field) {
                $this->field = $field->tagName;
                if ($field->tagName === 'answer') {
                    $this->field = 'answer[' . (count($answers) + 1) . ']';
                    if (count($answers) >= self::MAX_ITEMS_PER_QUESTION || ++$totalanswers > self::MAX_ITEMS_PER_BATCH) {
                        $this->reject('xmlcomplexity');
                    }
                    $this->attributes($field, ['fraction', 'format']);
                    if ($field->getAttribute('format') !== 'html') {
                        $this->reject();
                    }
                    $fraction = $this->number($field->getAttribute('fraction'));
                    if ($fraction < -100 || $fraction > 100) {
                        $this->reject();
                    }
                    $answer = ['fraction' => $fraction];
                    $allowed = $type === 'numerical' ? ['text', 'feedback', 'tolerance'] : ['text', 'feedback'];
                    foreach ($this->children($field, $allowed) as $part) {
                        $this->field = 'answer[' . (count($answers) + 1) . '].' . $part->tagName;
                        $answer[$part->tagName] = $part->tagName === 'feedback' ? $this->text($part, true) : $this->scalar($part);
                        if ($part->tagName === 'text' && $type === 'multichoice') {
                            $answer['text'] = clean_text($answer['text'], FORMAT_HTML);
                            $part->textContent = $answer['text'];
                        }
                    }
                    $this->field = 'answer[' . (count($answers) + 1) . '].text';
                    if (trim($answer['text'] ?? '') === '') {
                        $this->reject();
                    }
                    if ($type === 'numerical') {
                        $this->number($answer['text']);
                        $this->field = 'answer[' . (count($answers) + 1) . '].tolerance';
                        if ($this->number($answer['tolerance'] ?? '0') < 0) {
                            $this->reject();
                        }
                    }
                    $answers[] = $answer;
                } else if ($field->tagName === 'tags') {
                    $this->attributes($field);
                    $tags = $this->children($field, ['tag'], ['tag']);
                    $totaltags += count($tags);
                    if (count($tags) > self::MAX_ITEMS_PER_QUESTION || $totaltags > self::MAX_ITEMS_PER_BATCH) {
                        $this->reject('xmlcomplexity');
                    }
                    foreach ($tags as $tag) {
                        $value = $this->text($tag);
                        if ($value === '' || $value !== clean_param($value, PARAM_TAG)) {
                            $this->reject('xmltag');
                        }
                    }
                } else if ($field->tagName === 'name') {
                    $fields['name'] = $this->text($field);
                } else if (
                    in_array($field->tagName, ['questiontext', 'generalfeedback', 'correctfeedback',
                        'partiallycorrectfeedback', 'incorrectfeedback', 'graderinfo', 'responsetemplate'], true)
                ) {
                    $fields[$field->tagName] = $this->text($field, true);
                } else {
                    $fields[$field->tagName] = $this->scalar($field);
                }
            }
            foreach (['name', 'questiontext'] as $requiredfield) {
                $this->field = $requiredfield;
                if (trim($fields[$requiredfield] ?? '') === '') {
                    $this->reject();
                }
            }
            $this->field = 'name';
            if (\core_text::strlen($fields['name']) > 255) {
                $this->reject('xmlnamelength');
            }
            $this->field = 'defaultgrade';
            $grade = $this->number($fields['defaultgrade'] ?? '');
            if (
                ($type === 'description' && $grade != 0) ||
                ($type !== 'description' && ($grade < grading::MIN_MARK || $grade > grading::MAX_MARK))
            ) {
                $this->reject('xmlmarkrange');
            }
            $this->field = 'hidden/idnumber';
            if (($fields['hidden'] ?? '0') !== '0' || trim($fields['idnumber'] ?? '') !== '') {
                $this->reject();
            }
            $this->field = 'penalty';
            $penalty = $this->number($fields['penalty'] ?? '0');
            if ($penalty < 0 || $penalty > 1) {
                $this->reject();
            }
            $fractions = array_column($answers, 'fraction');
            $positive = array_filter($fractions, static fn($value) => $value > 0);
            $this->field = 'grading/options';
            if ($type === 'multichoice') {
                if (
                    count($answers) < 2 || !grading::valid_total($fractions) ||
                        !in_array($fields['single'] ?? '', ['true', 'false'], true) ||
                        !in_array($fields['shuffleanswers'] ?? '', ['0', '1'], true) ||
                        !in_array($fields['answernumbering'] ?? '', ['abc', 'ABCD', '123', 'none'], true) ||
                        ($fields['single'] === 'true' && count($positive) !== 1)
                ) {
                    $this->reject();
                }
            } else if ($type === 'truefalse') {
                $texts = array_column($answers, 'text');
                sort($texts);
                sort($fractions);
                if ($texts !== ['false', 'true'] || $fractions !== [0.0, 100.0]) {
                    $this->reject();
                }
            } else if (in_array($type, ['shortanswer', 'numerical'], true)) {
                if (
                    !in_array(100.0, $fractions, true) ||
                        ($type === 'shortanswer' && !in_array($fields['usecase'] ?? '', ['0', '1'], true))
                ) {
                    $this->reject();
                }
            } else if ($type === 'essay') {
                $defaults = ['responseformat' => 'editor', 'responserequired' => '1', 'responsefieldlines' => '15',
                    'attachments' => '0', 'attachmentsrequired' => '0', 'graderinfo' => '', 'responsetemplate' => ''];
                foreach ($defaults as $key => $value) {
                    if (($fields[$key] ?? null) !== $value) {
                        $this->reject();
                    }
                }
            }
        }
        if ($count !== $expected) {
            $this->question = 0;
            $this->field = 'count';
            $this->reject('xmlcount');
        }
        $sanitized = $document->saveXML();
        // CDATA and HTML purification can expand escaping; also bound what core will parse.
        if (strlen($sanitized) > self::MAX_BYTES) {
            $this->question = 0;
            $this->field = 'document';
            $this->reject('xmltoolarge');
        }
        return [$sanitized, $count];
    }
}
