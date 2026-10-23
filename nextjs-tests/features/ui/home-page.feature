Feature: Home page

    Scenario: "Get Started" goes to the onboarding page
        Given I navigate to "/"
        # Wait for the app's JavaScript before clicking (a click before hydration does nothing).
        And I wait for the page to load
        # "label" only finds form fields; this matches the start link/button by its
        # aria-label or its text, and skips hidden copies (e.g. a mobile menu).
        When I "click" the "1st" element with "[aria-label='Start permit renewal application']:visible, a:visible:has-text('Get Started'), button:visible:has-text('Get Started')" "locator"
        Then the URL should contain "/onboarding/what-you-need/"
