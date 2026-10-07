@qbank @qbank_uniquiz @javascript
Feature: UniQuiz question bank preparation
  Teachers can open the converter and its help without leaving Moodle.

  Scenario: Administrator opens the plugin guide
    Given the following "courses" exist:
      | fullname | shortname |
      | Course 1 | C1        |
    And I am on the "Course 1" "core_question > course question bank" page logged in as admin
    When I set the field "Question bank tertiary navigation" to "UniQuiz"
    Then I should see "Upload your questions"
    When I click on "Open the Guide & FAQ" "link"
    And I switch to a second window
    Then I should see "UniQuiz guide"
    And I should see "Basic CSV"
    And I should see "Direct import"
