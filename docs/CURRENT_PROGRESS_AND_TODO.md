# Backend Refactor Current Progress and TODO

Date: 2026-05-26
Branch: `refactor/backend-optimization-plan`
Latest remote baseline before this snapshot: `896538b docs update backend refactor progress`
Main source plan: `docs/REFACTOR_OPTIMIZATION_PLAN.md`

## Current Status

The backend refactor branch has completed these Phase 2 and Phase 7 slices on `refactor/backend-optimization-plan`:

- Auth forgot-password workflow extraction.
- Course request adapter extraction and facade reduction.
- VM Box request adapter extraction and facade reduction.
- Guacamole connection establishment/preflight removal of raw Express `Request`.
- AI Chat VM management removal of raw Express `Request` cloning.
- AI Box Build provisioning removal of synthetic Express request creation for VM provisioning.
- Template list/submitted-list workflow extraction.
- User service facade auth/error wrapper cleanup.
- Guacamole service connection helper consolidation.
- VM service read-context helper consolidation.
- Phase 7 unique-constraint preflight runbook and read-only duplicate check command.
- VM operation execution moved from `VMOperateService` into `VMOperationExecutionService`.
- VM deletion access/ownership checks moved from `VMManageService` into `VMDeletionAccessService`.
- AI Chat VM management now depends on VM module ports instead of service facades.
- AI Chat platform-guide workflow moved from `AIChatService` into `AIChatPlatformGuideService`.
- PVE route body/query adapter logic moved from `PVEService` into `PVERequestAdapterService`.
- `src/modules` has no reverse imports from `src/service`.

The latest recorded full gate is green after these slices:

- `npm run typecheck`
- targeted Auth tests: `npx vitest run tests/auth-forgot-password-service.test.ts tests/auth-login-service.test.ts tests/auth-registration-service.test.ts tests/auth-token-policy.test.ts` (`4` files, `25` tests)
- targeted Course tests: `npx vitest run tests/course-request-adapter-service.test.ts tests/course-read-service.test.ts tests/course-list-service.test.ts tests/course-mutation-service.test.ts tests/course-membership-service.test.ts tests/course-review-service.test.ts tests/course-lifecycle-service.test.ts` (`7` files, `30` tests)
- targeted VM Box/Guacamole tests: `npx vitest run tests/vm-box-list-service.test.ts tests/vm-box-review-service.test.ts tests/vm-box-writeup-service.test.ts tests/vm-box-answer-service.test.ts tests/vm-box-submission-create-service.test.ts tests/vm-box-submission-audit-service.test.ts tests/guacamole-connection-establishment-service.test.ts tests/guacamole-connection-preflight-service.test.ts tests/course-request-adapter-service.test.ts` (`9` files, `33` tests)
- targeted AI Chat VM tests: `npx vitest run tests/ai-chat-vm-management-service.test.ts tests/ai-chat-vm-intent-policy.test.ts tests/ai-chat-vm-pending-action-policy.test.ts tests/ai-chat-vm-response-policy.test.ts tests/ai-chat-request-policy.test.ts` (`5` files, `26` tests)
- targeted AI Box provisioning tests: `npx vitest run tests/ai-box-build-provisioning-service.test.ts tests/ai-box-build-run-execution-service.test.ts tests/ai-box-build-run-launch-service.test.ts tests/vm-creation-request-service.test.ts` (`4` files, `22` tests)
- targeted Template list tests: `npx vitest run tests/template-list-service.test.ts` (`1` file, `4` tests)
- targeted data hardening tests: `npx vitest run tests/unique-constraint-duplicate-check.test.ts tests/schema-indexes.test.ts` (`2` files, `8` tests)
- targeted VM operation/deletion + AI Chat boundary tests: `npx vitest run tests/ai-chat-platform-guide-service.test.ts tests/ai-chat-box-hint-service.test.ts tests/ai-chat-request-policy.test.ts tests/ai-chat-language-policy.test.ts tests/ai-chat-vm-management-service.test.ts tests/vm-operation-execution-service.test.ts tests/vm-deletion-access-service.test.ts` (`7` files, `35` tests)
- targeted PVE adapter tests: `npx vitest run tests/pve-request-adapter-service.test.ts tests/pve-task-service.test.ts tests/pve-qemu-config-access-service.test.ts tests/pve-datacenter-status-service.test.ts tests/pve-qemu-config-dto-factory.test.ts tests/pve-datacenter-status-policy.test.ts tests/pve-client.test.ts` (`7` files, `28` tests)
- `npm test` (`170` files, `874` tests)
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
  - forgot-password workflow service covering reset email, throttle, token validation, password policy, hashing, persistence, and invalid methods.
- VM/PVE refactor has substantial coverage:
  - VM creation, deletion, config update, read/status/network, operation policy, task persistence, resource accounting, PVE task status, PVE QEMU config access, and PVE datacenter status slices are extracted/tested.
- Guacamole refactor has substantial coverage:
  - auth/user lifecycle, connection management, shared preflight, get-or-create config, SSH/RDP/VNC establishment, disconnect, delete/list DTOs, and VM lookup boundaries are extracted/tested.
  - SSH/RDP/VNC establishment and preflight now accept user/request DTO inputs instead of raw Express `Request`.
- AI service refactor has substantial coverage:
  - AI Box Build job/draft/agent/runtime/run/workspace/provisioning/SSH execution flows are extracted/tested;
  - AI Chat request validation, language policy, hint workflow, platform-guide workflow, VM management workflow, target selection, pending-action flow, and response formatting are extracted/tested.
  - AI Chat VM management now accepts body/user context and calls VM read, VM operation, and VM deletion module ports instead of cloning Express requests or importing service facades.
  - AI Box Build provisioning now calls VM creation workflow DTOs directly instead of constructing an Express-like request.
- Course, Template, VM Box, and Review domains have many extracted/tested service and policy slices, including create/update/list/review/membership/submission/audit/writeup/answer flows.
- Template list, accessible-template list, and submitted-template detail assembly now live in `TemplateListService`.
- User profile/read facade methods now share a thin auth/error wrapper while delegating to extracted user modules.
- Guacamole SSH/RDP/VNC establishment now shares one service-level adapter helper.
- VM status/network reads now share one service-level actor-context resolver.
- VM operation execution now lives in `VMOperationExecutionService`; `VMOperateService` is a route/auth adapter.
- VM deletion ownership and workflow dispatch now lives in `VMDeletionAccessService`; `VMManageService` delegates delete DTOs.
- PVE request query/body mapping now lives in `PVERequestAdapterService`; `PVEService` is a token/role adapter for PVE workflows.
- Course and VM Box route-to-workflow adapter logic now lives behind DTO-style request adapter services, leaving their facades as thin auth/error wrappers.
- Safe non-unique indexes were added for common lookup/list paths.
- Unique-constraint hardening remains deferred, but `docs/DATA_HARDENING_UNIQUE_CONSTRAINTS.md` now records staging/production duplicate checks and cleanup order for candidate unique keys.
- `npm run data:check-unique-duplicates` now provides a read-only duplicate preflight command for staging/production runs.

## Service Size Snapshot

Current facade/service file sizes:

| File | Lines | Note |
| --- | ---: | --- |
| `src/service/GuacamoleService.ts` | 226 | Temporary adapter for auth/permission and connection DTO calls. |
| `src/service/VMBoxService.ts` | 190 | Thin auth/error wrapper around VM Box request adapter. |
| `src/service/CourseService.ts` | 160 | Thin auth/error wrapper around Course request adapter. |
| `src/service/PVEService.ts` | 157 | Thin token/role wrapper around PVE request adapter. |
| `src/service/AIChatService.ts` | 141 | Thin auth/error wrapper around hint, platform-guide, and VM-management modules. |
| `src/service/AIBoxBuildService.ts` | 126 | Thin pass-through wrapper. |
| `src/service/VMManageService.ts` | 124 | Creation/update/delete DTO adapter with deletion access extracted. |
| `src/service/UserService.ts` | 118 | Thin auth/error wrapper around profile/read modules. |
| `src/service/TemplateService.ts` | 117 | Listing/conversion/submission/audit workflows extracted. |
| `src/service/SuperAdminCRPService.ts` | 98 | Thin wrapper. |
| `src/service/ChapterService.ts` | 96 | Thin wrapper. |
| `src/service/VMService.ts` | 92 | Thin read facade with shared actor-context resolver. |
| `src/service/AuthService.ts` | 86 | Register/login/forgot-password extracted; verify/logout still in facade. |
| `src/service/VMOperateService.ts` | 81 | Thin request adapter delegating operation execution. |
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

No extracted module currently imports Express `Request`; remaining `Request` imports are facade-level service adapters.

## Recommended Next TODO

1. Continue Phase 7 data hardening.
   - Run `npm run data:check-unique-duplicates` on staging/production data.
   - Add unique constraints only after duplicate groups are cleaned and archived as empty.

2. Continue facade-boundary cleanup where useful.
   - Candidate targets: `VMManageService` creation/update helpers and smaller wrapper cleanup in `AuthService`/`TemplateManageService`.
   - Keep controller response shapes unchanged.

3. Keep gates mandatory for every slice.
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

1. `refactor vm operation deletion module boundaries`
2. `refactor ai chat platform guide service`
3. `refactor pve request adapter service`
4. `docs update backend refactor progress`

After each slice, update `docs/REFACTOR_OPTIMIZATION_PLAN.md` and this file with the new verification result.
