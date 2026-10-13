Feature: Applying for benefits through the API
  The API only accepts the app's session cookie, so these scenarios log in
  through the identity provider (password, then the authenticator code) once
  per run, and send the session with each request.

  Scenario: A verified applicant submits an application
    Given I am authenticated as "applicant" via API
    When I POST "/api/applications" with JSON body:
      """
      { "benefit": "Housing assistance" }
      """
    Then the response status should be 201
    And I store the value at "id" as "applicationId"
    And I register cleanup DELETE "/api/applications/{applicationId}"
    When I GET "/api/applications/{applicationId}"
    Then the response status should be 200
    And the value at "status" should equal "submitted"

  Scenario: The API knows who is signed in
    Given I am authenticated as "applicant" via API
    When I GET "/api/me"
    Then the response status should be 200
    And the value at "email" should equal "facial@test.local"
    And the value at "ial" should equal "2"

  Scenario: Applying needs a verified identity
    Given I am authenticated as "unverified" via API
    When I POST "/api/applications" with JSON body:
      """
      { "benefit": "Housing assistance" }
      """
    Then the response status should be 403
    And the value at "error" should equal "identity_verification_required"

  Scenario: The API refuses requests without a session
    When I GET "/api/applications"
    Then the response status should be 401
