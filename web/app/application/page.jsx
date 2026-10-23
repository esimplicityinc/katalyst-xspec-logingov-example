'use client';

import { useEffect, useState } from 'react';

// Loads the application through the BFF with the session cookie. Signed out:
// back to the BFF's login.
export default function Application() {
  const [app, setApp] = useState();
  const [error, setError] = useState();

  useEffect(() => {
    fetch('/v1/application/', { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.assign('/v1/auth/start/?returnTo=/application/');
          return;
        }
        if (!r.ok) throw new Error(`GET /v1/application failed: ${r.status}`);
        setApp(await r.json());
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!app) return <p>Loading your application…</p>;
  const info = app.personalInformation;
  return (
    <>
      <h1>Your application</h1>
      <p>Signed in as {app.applicant.email} (IAL{app.applicant.ial})</p>
      <dl>
        <dt>Status</dt>
        <dd>{app.status}</dd>
        <dt>Name</dt>
        <dd>{info ? `${info.givenName} ${info.surname}` : 'Not provided yet'}</dd>
      </dl>
      <p>
        <a href="/v1/auth/logout/">Sign out</a>
      </p>
    </>
  );
}
