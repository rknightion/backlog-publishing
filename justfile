set shell := ["bash", "-euo", "pipefail", "-c"]

# renovate: datasource=node-version depName=node
node_version := "26.9.0"

# List the available recipes.
default:
    @just --list

# Install the pinned toolchain.
setup:
    npm ci

# Format every source file in place.
[group('check')]
fmt:
    npx prettier --write .

# Fail if anything is unformatted.
[group('check')]
fmt-check:
    npx prettier --check .

# Type-check the Astro project.
[group('check')]
lint:
    npx astro check

# Parse and domain-rule tests. No network, no build.
[group('check')]
test:
    node --test tests/

# The gate. Everything that runs with only the Node toolchain and a warm cache.
[group('check')]
check: fmt-check lint test build

# Refresh the ingest cache from GitHub. The only recipe that touches the
# network, which is why `check` does not depend on it.
[group('gen')]
fetch:
    node scripts/fetch-backlogs.mjs

# Build the site and run every output assertion.
[group('build')]
build:
    node scripts/build.mjs

# Serve locally against whatever the last `just fetch` produced.
[group('dev')]
dev:
    npx astro dev

# Show what a deploy would upload, without uploading it.
[group('release')]
dry-run:
    npx wrangler deploy --dry-run

# Publish to backlogs.m7kni.io.
[group('release')]
deploy:
    npx wrangler deploy
