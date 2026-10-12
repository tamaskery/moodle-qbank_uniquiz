import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv, parseTxt, applySettings, validateQuestions, generateMoodleXml, escapeMoodleHtml,
  escapeXml, getInputDiagnostic} from '../js/core.js';

const settings = {answerNumbering: 'abc', shuffleAnswers: true, generateNames: true, removeQuestionNumbering: false};
const prepared = (source) => applySettings(parseCsv(source).questions, settings);

for (const value of ['\u0000', '\u0007', '\u000B', '\u000C', '\u001F', '\uFFFE', '\uFFFF', '\uD800', '\uDC00']) {
  test(`unsupported XML character U+${value.charCodeAt(0).toString(16)} is rejected at input, not after preview`, () => {
    for (const [parse, input] of [[parseCsv, `Question,A,B,Correct\n"Before${value}after",Yes,No,A`],
      [parseTxt, `Before${value}after\nA. Yes\nB. No\nANSWER: A`]]) {
      assert.throws(() => parse(input), (error) => {
        assert.equal(getInputDiagnostic(error).code, 'XML_INVALID_CHARACTER');
        assert.ok(getInputDiagnostic(error).metadata.line > 0);
        return true;
      });
    }
    assert.throws(() => escapeXml(value));
  });
}

test('plain HTML fields have distinct HTML and XML encoding layers', () => {
  assert.equal(escapeMoodleHtml('a<b and c>d & literal &lt;\n🦄'),
    'a&amp;lt;b and c&amp;gt;d &amp;amp; literal &amp;amp;lt;&lt;br&gt;🦄');
  assert.equal(escapeXml('a<b & c'), 'a&lt;b &amp; c');
  assert.equal(escapeMoodleHtml('one\r\ntwo\rthree'), 'one&lt;br&gt;two&lt;br&gt;three');
});

test('all HTML question and feedback fields preserve literal markup and newlines', () => {
  for (const type of ['multichoice', 'truefalse', 'shortanswer', 'numerical', 'essay', 'description']) {
    const answers = {multichoice: '<yes>,No,A', truefalse: 'true,false,A', shortanswer: '<yes>,No,A',
      numerical: '3,4,A', essay: ',,', description: ',,'}[type];
    const qs = prepared(`type,question_text,general_feedback,answer_1,answer_2,correct\n${type},"a<b\nnext","<feedback>",${answers}`);
    const xml = generateMoodleXml(qs, settings);
    assert.ok(xml.includes('<questiontext format="html"><text>a&amp;lt;b&lt;br&gt;next</text>'), type);
    assert.ok(xml.includes('<generalfeedback format="html"><text>&amp;lt;feedback&amp;gt;</text>'), type);
    if (type === 'multichoice') assert.ok(xml.includes('<text>&amp;lt;yes&amp;gt;</text>'));
    if (type === 'shortanswer') assert.ok(xml.includes('<text>&lt;yes&gt;</text>'), 'Accepted values must stay literal');
  }
});

test('structured TXT keeps prompt line breaks and accepts valid supplementary Unicode', () => {
  const parsed = parseTxt('First line 🦄\nSecond line 日本語\nA. Yes\nB. No\nANSWER: A');
  assert.equal(parsed.questions[0].text, 'First line 🦄\nSecond line 日本語');
  assert.ok(generateMoodleXml(applySettings(parsed.questions, settings), settings).includes('🦄&lt;br&gt;Second line'));
});

test('tag mutation and question-name truncation are blocked before export', () => {
  for (const tag of ['x'.repeat(256), '<tag>', 'a`b', 'a  b', 'a\tb']) {
    const qs = prepared(`question_text,answer_1,answer_2,correct,tags\nQuestion?,Yes,No,A,"${tag}"`);
    assert.ok(validateQuestions(qs).errors.some(({code}) => code === 'INVALID_TAG'), tag);
  }
  const qs = prepared(`question_text,question_name,answer_1,answer_2,correct\nQuestion?,${'x'.repeat(256)},Yes,No,A`);
  assert.ok(validateQuestions(qs).errors.some(({code}) => code === 'QUESTION_NAME_TOO_LONG'));
  const valid = prepared(`question_text,answer_1,answer_2,correct,tags\nQuestion?,Yes,No,A,"${'🦄'.repeat(255)}"`);
  assert.equal(validateQuestions(valid).canExport, true);
});

test('invalid characters introduced by settings are diagnosed by field', () => {
  const qs = prepared('question_text,answer_1,answer_2,correct\nQuestion?,Yes,No,A');
  qs[0].category = 'Invalid\u0000category';
  const error = validateQuestions(qs).errors.find(({code}) => code === 'XML_INVALID_CHARACTER');
  assert.equal(error.field, 'category');
  assert.equal(error.sourceIndex, 1);
  assert.throws(() => generateMoodleXml(qs, settings));
});
