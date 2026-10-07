import fs from 'node:fs/promises';
import {parseCsv, applySettings, generateMoodleXml} from '../source/js/core.js';
const settings = {answerNumbering: 'abc', shuffleAnswers: true, generateNames: true, removeQuestionNumbering: false};
const source = 'type,question_text,question_name,general_feedback,answer_1,answer_2,correct,answer_1_feedback\n' +
    'multichoice,"a<b and c>d & literal &lt;\nSecond line 🦄",Literal comparison,"<general>\nNext","<yes>\nLine",No,A,"<feedback>\nNext"\n' +
    'shortanswer,Type the exact string,Literal accepted value,,a<b & c,,A,Good';
const xml = text => generateMoodleXml(applySettings(parseCsv(text).questions, settings), settings);
await fs.mkdir(process.env.UNIQUIZ_QA_RESULTS, {recursive: true});
await fs.writeFile(process.env.UNIQUIZ_QA_RESULTS + '/text-fidelity.csv', source);
await fs.writeFile('/tmp/uniquiz-text.xml', xml(source));
await fs.writeFile(process.env.UNIQUIZ_QA_RESULTS + '/text-fidelity.xml', xml(source));
await fs.writeFile('/tmp/uniquiz-six.xml', xml(await fs.readFile(new URL('../source/examples/uniquiz-question-types.csv', import.meta.url), 'utf8')));
await fs.copyFile(new URL('../source/tests/fixtures/question-types-moodle.expected.json', import.meta.url), '/tmp/uniquiz-expected.json');
