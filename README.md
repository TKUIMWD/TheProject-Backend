# TheProject Backend

Express + TypeScript backend for a cybersecurity training platform. The API serves course, VM, VM Box, Guacamole, AI assistant, and AI Box Build workflows for the frontend under `/api/v1`.

## Current Architecture

The backend is organized around a thin HTTP boundary and tested domain modules:

- Routes register URL paths and HTTP methods.
- Controllers read Express `Request` data, validate auth tokens, and build DTO inputs.
- Services are thin DTO facades. They do not accept raw Express `Request` objects and do not import token validators directly.
- Request adapter services translate controller DTOs into workflow calls.
- Domain modules own policies, repositories, DTO factories, workflow services, and external clients.
- Mongoose schemas stay under `src/orm/schemas`; repository modules should own direct model access for new workflow code.

This boundary matters for new work: keep request parsing and token handling in controllers, keep business rules in modules, and keep service methods request-free.

## Features

- JWT-based user, admin, and superadmin API access.
- MongoDB persistence with Mongoose schemas and indexes.
- Proxmox VE VM lifecycle, config, task, status, and resource accounting flows.
- Apache Guacamole SSH/RDP/VNC browser-session provisioning.
- Course, class, chapter, review, membership, and invitation management.
- VM Box publishing, submissions, answers, writeups, reviews, and AI hint controls.
- OpenAI-compatible chat integrations for platform guidance and VM management.
- AI Box Build draft, artifact validation, OpenCode execution, VM provisioning, setup, validation, and run-log workflows.

## Requirements

- Node.js `>=20`
- npm
- MongoDB
- Proxmox VE API access for VM features
- Guacamole API access for browser sessions
- OpenAI-compatible API access for AI features
- OpenCode runtime for AI Box Build execution

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` with local values. Do not commit real `.env` secrets.

Required startup values include:

- `JWT_SECRET`
- `DBUSER`, `DBPASSWORD`, `DBHOST`, `DBPORT`, `DBNAME`
- `PVE_API_BASE_URL`

Optional integrations are configured by:

- `PVE_API_USERMODE_TOKEN`, `PVE_API_ADMINMODE_TOKEN`, `PVE_API_SUPERADMINMODE_TOKEN`
- `GUACAMOLE_BASE_URL`, `GUACAMOLE_API_USERNAME`, `GUACAMOLE_API_PASSWORD`, `PROJECTUSER_GUACAMOLE_PASSWORD`
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- `OPENCODE_BIN`, `OPENCODE_BOX_BUILD_MODEL`, `OPENCODE_BOX_BUILD_WORKDIR`, `OPENCODE_BOX_BUILD_REFERENCE_ROOT`
- `SENDER_EMAIL`, `GOOGLE_APP_PASSWORD`
- `CORS_ORIGINS`, `FRONTEND_BASE_URL`, `BACKEND_BASE_URL`

See [.env.example](.env.example) for the full list.

## Development

```bash
npm run dev
```

The dev script runs TypeScript in watch mode and restarts `build/app.js` with nodemon.

## Production Build

```bash
npm run build
npm start
```

## Verification

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

The GitHub Actions workflow in [.github/workflows/backend-ci.yml](.github/workflows/backend-ci.yml) runs install, typecheck, tests, build, and audit.

Use the duplicate preflight before adding deferred unique indexes to shared data:

```bash
npm run data:check-unique-duplicates
```

Run it against staging or production data before adding unique constraints. The local command only proves the script runs against the configured database.

## Project Structure

- `src/app.ts` - Express app entry and middleware setup.
- `src/Routers.ts` - API route registration.
- `src/controller` - HTTP request parsing, token validation, response sending, and DTO assembly.
- `src/service` - thin request-free facades that accept DTOs or actor context.
- `src/modules` - request adapters, domain policies, repositories, DTO factories, workflow services, and external clients.
- `src/orm/schemas` - Mongoose schemas.
- `src/utils` - shared utilities, mail senders, VM/PVE helpers, token helpers, and prompts.
- `tests` - Vitest unit and workflow tests.
- `docs` - platform and refactor documentation.

## Important Modules

- `src/modules/pve` - PVE client, QEMU config access, task status workflows, datacenter DTO policy.
- `src/modules/vm` - VM creation, deletion, config update, read workflows, resource accounting, repositories, and task policies.
- `src/modules/guacamole` - Guacamole API client, auth, connection profile, preflight, lifecycle, management, and disconnect services.
- `src/modules/ai-chat` - AI chat request policies, language policy, Box hint service, and VM management assistant workflows.
- `src/modules/ai-box-build` - AI Box Build draft, run launch, execution, provisioning, workspace, validation, OpenCode, and SSH execution flows.
- `src/modules/courses`, `src/modules/templates`, `src/modules/vm-box`, `src/modules/reviews`, `src/modules/users`, `src/modules/auth` - platform domain logic.

## Development Guidelines

- New service methods should accept DTOs or actor context, not Express `Request`.
- Controllers should preserve the existing API response shape: `{ code, message, body }`.
- Put route body/query/params mapping in a request adapter when the mapping is shared or non-trivial.
- Put permission, validation, persistence, and external API behavior in `src/modules`.
- Add focused Vitest coverage for changed policies, adapters, and workflow services.
- Run `npm run typecheck`, targeted tests, `npm test`, `npm run build`, and `npm audit --audit-level=moderate` before merging large backend changes.

## Security Notes

- Never commit real `.env` values, API tokens, passwords, generated credentials, or Guacamole session URLs.
- Logs use redaction helpers for known secrets and token-like values.
- CORS should be restricted with `CORS_ORIGINS` outside local development.
- `HTTP_ALLOW_INSECURE_TLS` and `PVE_ALLOW_INSECURE_TLS` are for controlled lab environments only.
- Guacamole default credentials must be changed in any real deployment.

## Refactor Notes

The backend has been modularized around tested domain services and policies. The latest refactor moved the remaining service facades away from raw Express `Request` usage and into DTO-style boundaries owned by controllers.

Major completed slices include:

- Auth registration, login, verification, logout, and forgot-password workflows.
- VM creation, deletion, config update, read/status/network, operation execution, task status, and resource accounting.
- PVE client and request adapters for QEMU config, node status, task status, cleanup, and datacenter status.
- Guacamole auth/user lifecycle, SSH/RDP/VNC establishment, preflight, connection management, disconnect, and request adapters.
- AI Chat Box hints, platform guide, VM management workflows, request validation, language policy, and pending-action handling.
- AI Box Build job/draft/run/workspace/provisioning/OpenCode/SSH execution workflows.
- Course, Class, Chapter, Template, VM Box, review, writeup, answer, submission, and audit workflows.
- SuperAdmin user management and compute resource plan request adapters.
- Data-hardening preflight docs and a read-only duplicate-check command for deferred unique constraints.

The latest recorded local gate is green:

- `npm run typecheck`
- targeted facade-boundary tests: `52` files, `261` tests
- `npm test`: `187` files, `924` tests
- `npm run build`
- `npm audit --audit-level=moderate`: `0` vulnerabilities
- scans for merge-conflict markers, backend `console.*`, reverse imports from `src/modules` to `src/service`, and service-layer Express `Request`/auth-helper imports

Remaining external work: run the duplicate preflight against staging or production data before enabling unique constraints. See [docs/CURRENT_PROGRESS_AND_TODO.md](docs/CURRENT_PROGRESS_AND_TODO.md), [docs/REFACTOR_OPTIMIZATION_PLAN.md](docs/REFACTOR_OPTIMIZATION_PLAN.md), and [docs/DATA_HARDENING_UNIQUE_CONSTRAINTS.md](docs/DATA_HARDENING_UNIQUE_CONSTRAINTS.md) for details.
