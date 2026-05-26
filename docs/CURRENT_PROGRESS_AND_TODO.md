# Backend Refactor Current Progress and TODO

Date: 2026-05-26
Branch: `refactor/backend-optimization-plan`
Latest pushed commit: `e5957c3 refactor auth registration service`
Main source plan: `docs/REFACTOR_OPTIMIZATION_PLAN.md`

## Current Status

The backend refactor branch is pushed and clean against `origin/refactor/backend-optimization-plan`.

The latest recorded full gate is green:

- `npm run typecheck`
- `npm test` (`162` files, `839` tests)
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- merge-conflict marker scan
- backend `console.*` scan
- `git diff --check`

## Completed Highlights

- Compile baseline restored; the original `VMManageService.ts` merge conflict is resolved.
- CI-facing scripts are standardized: `typecheck`, `test`, `build`, `build:watch`.
- Runtime dependency cleanup is done for current scope; Node `>=20` is documented.
- Sensitive logging cleanup and backend `console.*` cleanup are complete for current service/utils/controller/router surfaces.
- Typed env/config, CORS whitelist policy, centralized dotenv loading, and request-scoped TLS behavior are in place.
- External integrations now have dedicated boundaries:
  - `PVEClient`
  - `GuacamoleApiClient`
  - `OpenAIClientFactory`
  - `OpenAICompatibleChatClient`
  - `OpenCodeRunner`
- Auth improvements completed:
  - token user ID validation;
  - registration policy and registration workflow service;
  - login workflow, wrong-attempt lockout, unverified-email resend, and token response behavior.
- VM/PVE refactor has substantial coverage:
  - VM creation, deletion, config update, read/status/network, operation policy, task persistence, resource accounting, PVE task status, PVE QEMU config access, and PVE datacenter status slices are extracted/tested.
- Guacamole refactor has substantial coverage:
  - auth/user lifecycle, connection management, shared preflight, get-or-create config, SSH/RDP/VNC establishment, disconnect, delete/list DTOs, and VM lookup boundaries are extracted/tested.
- AI service refactor has substantial coverage:
  - AI Box Build job/draft/agent/runtime/run/workspace/provisioning/SSH execution flows are extracted/tested;
  - AI Chat request validation, language policy, hint workflow, VM management workflow, target selection, pending-action flow, and response formatting are extracted/tested.
- Course, Template, VM Box, and Review domains have many extracted/tested service and policy slices, including create/update/list/review/membership/submission/audit/writeup/answer flows.
- Safe non-unique indexes were added for common lookup/list paths.

## Service Size Snapshot

Current facade/service file sizes:

| File | Lines | Note |
| --- | ---: | --- |
| `src/service/CourseService.ts` | 401 | Largest remaining facade; still a good Phase 2 target. |
| `src/service/VMBoxService.ts` | 368 | Still broad; many workflows are extracted but facade remains busy. |
| `src/service/GuacamoleService.ts` | 246 | Mostly wrapper plus auth/permission glue; Request boundary still remains. |
| `src/service/TemplateService.ts` | 232 | Medium remaining facade. |
| `src/service/UserService.ts` | 202 | Profile/read work extracted; some Request boundary remains. |
| `src/service/AIChatService.ts` | 239 | Thin owner, but AI VM management still depends on Request cloning. |
| `src/service/PVEService.ts` | 177 | Much smaller after QEMU/datacenter extraction. |
| `src/service/VMOperateService.ts` | 161 | Operation executor exists, but service still accepts Request. |
| `src/service/AuthService.ts` | 143 | Register/login extracted; forgot-password/verify/logout still in facade. |
| `src/service/VMManageService.ts` | 140 | Creation/update/deletion workflows mostly extracted. |
| `src/service/AIBoxBuildService.ts` | 126 | Thin pass-through wrapper. |
| `src/service/VMService.ts` | 113 | VM read workflow extracted. |
| `src/service/SuperAdminCRPService.ts` | 98 | Thin wrapper. |
| `src/service/ChapterService.ts` | 96 | Thin wrapper. |
| `src/service/ClassService.ts` | 78 | Thin wrapper. |
| `src/service/SuperAdminService.ts` | 78 | Thin wrapper. |
| `src/service/TemplateManageService.ts` | 76 | Thin wrapper. |

## Remaining Gaps

The main unfinished architectural theme is Phase 2: service boundary cleanup. Most service facade classes still accept Express `Request`, even when their underlying workflow modules already accept DTOs or actor context.

Current services still importing `Request` from Express include:

- `AuthService`
- `CourseService`
- `GuacamoleService`
- `TemplateManageService`
- `VMOperateService`
- `UserService`
- `VMManageService`
- `SuperAdminCRPService`
- `VMService`
- `TemplateService`
- `AIChatService`
- `ChapterService`
- `ClassService`
- `PVEService`
- `VMBoxService`
- `AIBoxBuildService`
- `SuperAdminService`

Some extracted modules still carry `Request` because they bridge legacy service methods:

- `AIChatVMManagementService`
- `GuacamoleConnectionPreflightService`
- `GuacamoleConnectionEstablishmentService`
- `AIBoxBuildProvisioningService`

## Recommended Next TODO

1. Extract `AuthForgotPasswordService`.
   - Why first: `AuthService` is now small enough to finish cleanly, and forgot-password still mixes request method branching, token validation, password policy, email throttle, hashing, and persistence.
   - Expected files:
     - `src/modules/auth/AuthForgotPasswordService.ts`
     - `tests/auth-forgot-password-service.test.ts`
   - Acceptance:
     - preserve existing POST/PUT response messages;
     - keep email reset throttle behavior;
     - cover missing email, unknown email privacy response, reset email send, throttle response, missing password, weak password, token validation error, successful password reset, and invalid method through facade or policy tests;
     - run targeted Auth tests, then full gate.

2. Reduce `CourseService` as the next large facade.
   - Candidate slice: extract remaining route-to-workflow adapter helpers or split public/admin listing wrappers.
   - Goal: shrink `CourseService.ts` below roughly `250` lines while preserving existing API response shape.
   - Tests: use existing course service/policy tests plus targeted new tests for any moved adapter logic.

3. Reduce `VMBoxService` facade.
   - Candidate slice: move remaining request adapter logic into DTO-level workflow calls.
   - Goal: keep `VMBoxService` as a thin wrapper around extracted VM Box modules.
   - Tests: run VM Box list/review/writeup/answer/submission targeted tests plus full gate.

4. Remove Express `Request` from extracted modules where possible.
   - Start with Guacamole:
     - pass authenticated user/context and request body into connection establishment/preflight instead of passing raw `Request`;
     - keep `GuacamoleService` as the temporary adapter until controllers are ready to change.
   - Then AI Chat VM management:
     - replace request cloning with DTO calls into VM read/operate/delete workflows.

5. Continue Phase 7 data hardening.
   - Unique constraints are still intentionally deferred.
   - Before adding them, write data cleanup/dedup checks and migration notes for username/email and other identity-like fields.

6. Keep gates mandatory for every slice.
   - Targeted tests for touched modules.
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm audit --audit-level=moderate`
   - conflict-marker scan
   - backend `console.*` scan
   - `git diff --check`

## Suggested Next Commit Shape

Use small, isolated commits:

1. `refactor auth forgot password service`
2. `refactor course service adapters`
3. `refactor vm box service adapters`
4. `refactor guacamole request boundaries`
5. `refactor ai chat vm action boundaries`

After each slice, update `docs/REFACTOR_OPTIMIZATION_PLAN.md` and this file with the new verification result.
