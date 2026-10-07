UniQuiz source-question-numbering stress-test pack

Purpose
-------
Verify converter-wide cleanup of source question numbering without damaging legitimate numeric question text.

Expected auto-strip rule for this test pack
-------------------------------------------
Strip every clearly detected supported prefix independently, including mixed styles,
non-consecutive source numbers, and single-question input.

Files expected to STRIP source numbering
-----------------------------------------
1. numbering-dot-mcq.csv
   1. Question -> Question

2. numbering-paren-mcq.csv
   1) Question -> Question

3. numbering-q-mcq.csv
   Q1. Question -> Question

4. numbering-question-label-mcq.csv
   Question 1: Question -> Question

5. numbering-truefalse.csv
   Boolean shorthand CSV. Source numbering should be removed before preview/XML/name generation.

6. numbering-structured-txt.txt
   Structured TXT questions numbered 1..8 should be cleaned.

Files expected to PRESERVE question text
----------------------------------------
7. numbering-preserve-numeric.csv
   Legitimate numeric-leading content such as:
   - 1.5 litres...
   - 2026 was...
   - 10 km...
   - 2-factor authentication...
   These numbers are educational content and must remain.

8. numbering-broken-sequence.csv
   Prefixes are 1,2,4,5,7 rather than 1..N.
   Each syntactically clear prefix should be stripped independently.

9. numbering-preserve-txt.txt
   Same preservation cases in TXT.

Important assertions
--------------------
- Answer choice label settings are unrelated and their Moodle XML behavior must remain unchanged.
- Generate question names must use the CLEANED question text when source numbering is stripped.
- Preview and Moodle XML must use cleaned question text.
- Answer text, correctness, fractions, shuffle, capitalization, Unicode, XML escaping and all other behavior must remain unchanged.
- AIKEN Fixer behavior must remain unchanged; it already has its own numbering review workflow.
