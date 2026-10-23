Feature: Updating the application through the API

    Background:
        # Logs in through /v1/auth/start (provider, one-time code, callback) in a
        # headless browser once per run; later API steps send the session cookie.
        Given I am authenticated as "applicant" via API
        When I GET "/v1/application"
        Then the response status should be 200
        # The BFF sends its CSRF token as a response header and wants it back
        # on changing requests. The custom step (steps.ts) reads the header.
        And I store the CSRF token as "csrf"
        And I set header "X-CSRFToken" to "{csrf}"

    Scenario: The applicant updates their details
        When I PUT "/v1/application/personal-information" with JSON body:
            """
            {
                "givenName": "Test",
                "surname": "Applicant",
                "emailAddress": "applicant@example.com",
                "phoneNumber": "2025550100",
                "address": { "address1": "1 Main St", "city": "Springfield", "state": "VA", "zipCode": "22150" },
                "permitType": "renewal"
            }
            """
        Then the response status should be 200
        And the value at "personalInformation.surname" should equal "Applicant"

    Scenario: Changing data without the CSRF token is refused
        When I set header "X-CSRFToken" to "wrong"
        And I PUT "/v1/application/personal-information" with JSON body:
            """
            { "givenName": "Test", "surname": "Applicant", "emailAddress": "applicant@example.com", "permitType": "renewal" }
            """
        Then the response status should be 403
        And the value at "error" should equal "csrf_token_invalid"
