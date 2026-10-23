Feature: Sign in through the BFF in the browser
  Scenario: Full sign-in (password, then one-time code), then the application page
    When I log in as "applicant" in UI
    And I navigate to "/application/"
    Then I should see text "Signed in as facial@test.local (IAL2)"
