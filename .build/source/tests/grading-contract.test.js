import fs from 'node:fs';
const vectors = JSON.parse(fs.readFileSync(new URL('../../../tests/fixtures/grading-vectors.json', import.meta.url), 'utf8'));
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {applySettings, parseCsv, validateQuestions, generateMoodleXml, validateGeneratedXml} from '../js/core.js';
const require = createRequire(new URL('../../moodle/package.json', import.meta.url));
const {JSDOM} = require('jsdom');
const parser = new JSDOM('').window.DOMParser;
const settings = {answerNumbering: 'abc', shuffleAnswers: true, generateNames: true};
function prepare(csv) {
    const parsed = parseCsv(csv);
    const questions = applySettings(parsed.questions, settings);
    const analysis = validateQuestions(questions, parsed.fileIssues);
    let xml;
    if (analysis.canExport) {
        xml = generateMoodleXml(questions, settings);
    } else {
        assert.throws(() => generateMoodleXml(questions, settings));
        // Independently exercise the final XML validator with a malformed grading envelope.
        const valid = questions.map(q => ({...q, defaultMark: 1, answers: q.answers.map((a, i) =>
            ({...a, fraction: i === 0 ? 100 : 0})), single: false}));
        xml = generateMoodleXml(valid, settings);
        let index = 0;
        xml = xml.replace(/fraction="[^"]*"/g, () => 'fraction="' + questions[0].answers[index++].fraction + '"');
    }
    return {questions, xml, analysis,
        final: validateGeneratedXml(xml, parser)};
}
for (const type of ['shortanswer', 'numerical']) {
    test(type + ' requires full credit and recovers with a corrected answer', () => {
        for (const fraction of [0, 50, 99.9999999, 100]) {
            const result = prepare('type,question_text,answer_1,answer_1_fraction\n' +
                type + ',Example,1,' + fraction);
            assert.equal(result.analysis.canExport, fraction === 100, String(fraction));
            assert.equal(result.final.valid, fraction === 100, String(fraction));
            if (fraction !== 100) {
                assert.ok(result.analysis.questions[0].diagnostics.some(d => d.message?.includes('100%') || d.detail?.includes('100%') || JSON.stringify(d).includes('100%')));
            }
        }
        const mixed = prepare('type,question_text,answer_1,answer_1_fraction,answer_2,answer_2_fraction\n' +
            type + ',Example,1,100,2,50');
        assert.equal(mixed.analysis.canExport, true);
        assert.equal(mixed.final.valid, true);
    });
}
test('numerical tolerances round-trip without seven-place truncation', () => {
    for (const value of ['0', '0.00000001', '0.000000000001', '0.123456789012345', '12.3456789012345']) {
        const result = prepare('type,question_text,answer_1,answer_1_fraction,answer_1_tolerance\n' +
            'numerical,Example,1,100,' + value);
        assert.equal(result.analysis.canExport, true);
        assert.equal(result.final.valid, true);
        const doc = new parser().parseFromString(result.xml, 'application/xml');
        const tolerance = doc.querySelector('tolerance').textContent;
        assert.equal(Number(tolerance), Number(value));
        assert.doesNotMatch(tolerance, /[eE]/);
    }
});
test('multiple-choice totals match the server tolerance and preserve generated thirds', () => {
    for (const {fractions, valid, name} of vectors.totals) {
        const headers = fractions.map((_, i) => 'answer_' + (i + 1));
        const fractionHeaders = fractions.map((_, i) => 'answer_' + (i + 1) + '_fraction');
        const values = fractions.map((_, i) => 'Option ' + (i + 1));
        const result = prepare(['type', 'question_text', ...headers, ...fractionHeaders].join(',') + '\n' +
            ['multichoice', name, ...values, ...fractions].join(','));
        assert.equal(result.analysis.canExport, valid, fractions.join(','));
        assert.equal(result.final.valid, valid, fractions.join(','));
    }
    const thirds = prepare('question_text,answer_1,answer_2,answer_3,correct\nExample,A,B,C,A;B;C');
    assert.equal(thirds.analysis.canExport, true);
    assert.equal(thirds.final.valid, true);
});

test('default marks are bounded in analysis and generated XML for every graded type', () => {
    for (const type of ['multichoice', 'truefalse', 'shortanswer', 'numerical', 'essay']) {
        for (const {value, valid} of vectors.marks) {
            const fields = type === 'essay' ? '' : type === 'truefalse'
                ? ',true,false,100,0' : ',1,2,100,0';
            const csv = 'type,question_text,default_mark,answer_1,answer_2,answer_1_fraction,answer_2_fraction\n' +
                type + ',Example,1' + fields;
            const parsed = parseCsv(csv);
            const questions = applySettings(parsed.questions, settings).map(q => ({...q, defaultMark: value}));
            assert.equal(validateQuestions(questions, parsed.fileIssues).canExport, valid, type + ': ' + value);
            const safe = questions.map(q => ({...q, defaultMark: 1}));
            const xml = generateMoodleXml(safe, settings).replace(/<defaultgrade>[^<]+<\/defaultgrade>/,
                '<defaultgrade>' + value + '</defaultgrade>');
            assert.equal(validateGeneratedXml(xml, parser).valid, valid, type + ': final ' + value);
        }
    }
});
