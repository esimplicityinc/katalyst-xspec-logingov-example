export default function WhatYouNeed() {
  return (
    <>
      <h1>What you need</h1>
      <ul>
        <li>Your current permit number</li>
                <li>A Login.gov account with an authentication app</li>
      </ul>
      {/* A plain link: /v1/auth/start/ is the BFF's route and leaves the app. */}
      <a href="/v1/auth/start/?returnTo=/application/" className="button">
        Sign in with Login.gov
      </a>
    </>
  );
}
