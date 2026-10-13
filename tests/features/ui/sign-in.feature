Feature: Signing in and seeing applications
  "I am logged in as" signs in through the identity provider once per role
  per run (password page, then the one-time code page) and every other
  scenario starts with that saved session.

  Scenario: A signed-in applicant sees their benefits
    Given I am logged in as "applicant"
    When I navigate to "/"
    Then I should see text "Your benefits"
    And I should see text "Signed in as facial@test.local (IAL2)"

  Scenario: An application submitted through the API shows up in the UI
    Given I am authenticated as "applicant" via API
    When I POST "/api/applications" with JSON body:
      """
      { "benefit": "Childcare subsidy" }
      """
    Then the response status should be 201
    And I store the value at "id" as "applicationId"
    And I register cleanup DELETE "/api/applications/{applicationId}"
    Given I am logged in as "applicant"
    When I navigate to "/applications"
    Then I should see text "Childcare subsidy"

  Scenario: The sign-in itself, with password and authenticator code
    When I log in as "unverified" in UI
    Then I should see text "Signed in as basic@test.local (IAL1)"
