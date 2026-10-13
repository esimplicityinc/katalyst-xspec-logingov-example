# login.gov-style example: Keycloak + BFF app + katalyst-xspec tests

default:
    @just --list

# Install the tests' dependencies and Chromium, and create tests/.env
setup:
    cd tests && npm install && npx playwright install chromium
    cd tests && test -f .env || cp .env.example .env

# Start Keycloak (the login.gov stand-in) and wait until it's ready
up:
    docker compose up -d --wait

# Run the service under test on http://localhost:4100
app:
    node app/server.mjs

# Run the scenarios (default 4 workers)
test workers="4":
    cd tests && WORKERS={{workers}} npm test

# Log everyone out of the app, as if their sessions had expired
expire:
    curl -s -X POST http://localhost:4100/__test/expire-sessions

# Stop Keycloak
down:
    docker compose down
