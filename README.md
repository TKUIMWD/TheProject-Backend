# TheProject Backend

Express + TypeScript backend for a cybersecurity training platform. The API serves course, VM, VM Box, Guacamole, AI assistant, and AI Box Build workflows for the frontend under `/api/v1`.

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

## Project Structure

- `src/app.ts` - Express app entry and middleware setup.
- `src/Routers.ts` - API route registration.
- `src/controller` - HTTP controller layer.
- `src/service` - request-level service wrappers and authentication boundaries.
- `src/modules` - domain policies, repositories, DTO factories, workflow services, and external clients.
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

## Security Notes

- Never commit real `.env` values, API tokens, passwords, generated credentials, or Guacamole session URLs.
- Logs use redaction helpers for known secrets and token-like values.
- CORS should be restricted with `CORS_ORIGINS` outside local development.
- `HTTP_ALLOW_INSECURE_TLS` and `PVE_ALLOW_INSECURE_TLS` are for controlled lab environments only.
- Guacamole default credentials must be changed in any real deployment.

## Refactor Notes

The backend has been modularized around tested domain services and policies. See [docs/REFACTOR_OPTIMIZATION_PLAN.md](docs/REFACTOR_OPTIMIZATION_PLAN.md) for the executed refactor and optimization plan, verification history, and remaining audit context.
