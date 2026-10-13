// Create the login.gov stand-in realm through Keycloak's admin API, for CI
// systems that run Keycloak as a service container and can't mount
// keycloak/logingov-local-realm.json into it (GitLab CI services, for one).
//
//   node ci/import-realm.mjs http://keycloak:8180
//
// Uses KC_BOOTSTRAP_ADMIN_USERNAME / KC_BOOTSTRAP_ADMIN_PASSWORD (default admin/admin).
import fs from 'node:fs';

const base = (process.argv[2] || 'http://localhost:8180').replace(/\/+$/, '');
const realm = JSON.parse(fs.readFileSync(new URL('../keycloak/logingov-local-realm.json', import.meta.url), 'utf8'));

const token = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.KC_BOOTSTRAP_ADMIN_USERNAME || 'admin',
    password: process.env.KC_BOOTSTRAP_ADMIN_PASSWORD || 'admin',
  }),
}).then(async (r) => {
  if (!r.ok) throw new Error(`Keycloak admin login failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
});

const res = await fetch(`${base}/admin/realms`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(realm),
});
if (res.status === 409) console.log(`Realm "${realm.realm}" already exists`);
else if (!res.ok) throw new Error(`Creating realm "${realm.realm}" failed: ${res.status} ${await res.text()}`);
else console.log(`Created realm "${realm.realm}" at ${base}`);
