# Backend Refactor Current Progress and TODO

Date: 2026-05-26
Branch: `refactor/backend-optimization-plan`
Latest remote baseline before this snapshot: `f66ea2f docs update template service refactor progress`
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
- VM Manage create/update/delete route body adapter logic moved from `VMManageService` into `VMManageRequestAdapterService`.
- Template Manage update/delete/clone route body adapter logic moved from `TemplateManageService` into `TemplateManageRequestAdapterService`.
- Compute Resource Plan create/update/delete/list/get-by-id route adapter logic moved from `SuperAdminCRPService` into `ComputeResourcePlanRequestAdapterService`.
- SuperAdmin user-management route body adapter logic moved from `SuperAdminService` into `SuperAdminRequestAdapterService`.
- Auth verify/logout session behavior moved from `AuthService` into `AuthSessionService`.
- Course class/chapter route params/body adapter logic moved from `ClassService` and `ChapterService` into `CourseStructureRequestAdapterService`.
- Template list/convert/submit/audit route body adapter logic moved from `TemplateService` into `TemplateRequestAdapterService`.
- VM read/list/status/network route query adapter logic moved from `VMService` into `VMReadRequestAdapterService`.
- AI Box Build job/run route params/body/header adapter logic moved from `AIBoxBuildService` into `AIBoxBuildRequestAdapterService`.
- AI Chat hint/platform-guide/VM-management route body adapter logic moved from `AIChatService` into `AIChatRequestAdapterService`.
- Guacamole connection/disconnect/list/delete route body adapter logic moved from `GuacamoleService` into `GuacamoleRequestAdapterService`.
- VM Box route-to-workflow request adapter now has injectable dependencies and direct mapping coverage; `VMBoxService` shares one request-context helper for body/query/params forwarding.
- Course route-to-workflow request adapter now has injectable dependencies and direct mapping coverage; `CourseService` shares one request-context helper for body/query/params forwarding.
- `PVEService` now shares one request-context helper for body/query forwarding into `PVERequestAdapterService`.
- `TemplateService` now shares one token/error wrapper and one request-context helper for Template request adapter calls.
- `AIBoxBuildService` now shares one request-context helper for params/body/authorization forwarding into `AIBoxBuildRequestAdapterService`.
- `src/modules` has no reverse imports from `src/service`.

The latest recorded full gate is green after these slices:

- `npm run typecheck`
- targeted Auth tests: `npx vitest run tests/auth-session-service.test.ts tests/auth-forgot-password-service.test.ts tests/auth-login-service.test.ts tests/auth-registration-service.test.ts tests/auth-token-policy.test.ts` (`5` files, `29` tests)
- targeted Course tests: `npx vitest run tests/course-request-adapter-service.test.ts tests/course-read-service.test.ts tests/course-list-service.test.ts tests/course-mutation-service.test.ts tests/course-membership-service.test.ts tests/course-review-service.test.ts tests/course-lifecycle-service.test.ts` (`7` files, `30` tests)
- targeted Course request adapter tests: `npx vitest run tests/course-request-adapter-service.test.ts tests/course-read-service.test.ts tests/course-list-service.test.ts tests/course-mutation-service.test.ts tests/course-membership-service.test.ts tests/course-review-service.test.ts tests/course-lifecycle-service.test.ts tests/course-structure-request-adapter-service.test.ts` (`8` files, `36` tests)
- targeted Course structure tests: `npx vitest run tests/course-structure-request-adapter-service.test.ts tests/class-management-service.test.ts tests/chapter-management-service.test.ts tests/class-content-policy.test.ts tests/chapter-content-policy.test.ts tests/course-request-adapter-service.test.ts` (`6` files, `31` tests)
- targeted VM Box/Guacamole tests: `npx vitest run tests/vm-box-list-service.test.ts tests/vm-box-review-service.test.ts tests/vm-box-writeup-service.test.ts tests/vm-box-answer-service.test.ts tests/vm-box-submission-create-service.test.ts tests/vm-box-submission-audit-service.test.ts tests/guacamole-connection-establishment-service.test.ts tests/guacamole-connection-preflight-service.test.ts tests/course-request-adapter-service.test.ts` (`9` files, `33` tests)
- targeted VM Box request adapter tests: `npx vitest run tests/vm-box-request-adapter-service.test.ts tests/vm-box-list-service.test.ts tests/vm-box-review-service.test.ts tests/vm-box-writeup-service.test.ts tests/vm-box-answer-service.test.ts tests/vm-box-submission-create-service.test.ts tests/vm-box-submission-audit-service.test.ts tests/vm-box-ai-assistant-service.test.ts` (`8` files, `32` tests)
- targeted AI Chat VM tests: `npx vitest run tests/ai-chat-vm-management-service.test.ts tests/ai-chat-vm-intent-policy.test.ts tests/ai-chat-vm-pending-action-policy.test.ts tests/ai-chat-vm-response-policy.test.ts tests/ai-chat-request-policy.test.ts` (`5` files, `26` tests)
- targeted AI Chat request adapter tests: `npx vitest run tests/ai-chat-request-adapter-service.test.ts tests/ai-chat-box-hint-service.test.ts tests/ai-chat-platform-guide-service.test.ts tests/ai-chat-vm-management-service.test.ts tests/ai-chat-request-policy.test.ts tests/ai-chat-language-policy.test.ts` (`6` files, `30` tests)
- targeted AI Box provisioning tests: `npx vitest run tests/ai-box-build-provisioning-service.test.ts tests/ai-box-build-run-execution-service.test.ts tests/ai-box-build-run-launch-service.test.ts tests/vm-creation-request-service.test.ts` (`4` files, `22` tests)
- targeted AI Box request adapter tests: `npx vitest run tests/ai-box-build-request-adapter-service.test.ts tests/ai-box-build-draft-service.test.ts tests/ai-box-build-job-management-service.test.ts tests/ai-box-build-run-launch-service.test.ts tests/ai-box-build-run-execution-service.test.ts` (`5` files, `23` tests)
- targeted Template list tests: `npx vitest run tests/template-list-service.test.ts` (`1` file, `4` tests)
- targeted Template request adapter tests: `npx vitest run tests/template-request-adapter-service.test.ts tests/template-list-service.test.ts tests/template-conversion-service.test.ts tests/template-submission-create-service.test.ts tests/template-audit-service.test.ts tests/template-submission-audit-policy.test.ts` (`6` files, `28` tests)
- targeted Guacamole request adapter tests: `npx vitest run tests/guacamole-request-adapter-service.test.ts tests/guacamole-connection-establishment-service.test.ts tests/guacamole-connection-preflight-service.test.ts tests/guacamole-disconnect-service.test.ts tests/guacamole-connection-management-service.test.ts tests/guacamole-connection-request-policy.test.ts` (`6` files, `34` tests)
- targeted data hardening tests: `npx vitest run tests/unique-constraint-duplicate-check.test.ts tests/schema-indexes.test.ts` (`2` files, `8` tests)
- targeted VM operation/deletion + AI Chat boundary tests: `npx vitest run tests/ai-chat-platform-guide-service.test.ts tests/ai-chat-box-hint-service.test.ts tests/ai-chat-request-policy.test.ts tests/ai-chat-language-policy.test.ts tests/ai-chat-vm-management-service.test.ts tests/vm-operation-execution-service.test.ts tests/vm-deletion-access-service.test.ts` (`7` files, `35` tests)
- targeted VM read adapter tests: `npx vitest run tests/vm-read-request-adapter-service.test.ts tests/vm-read-service.test.ts tests/vm-operation-policy.test.ts` (`3` files, `18` tests)
- targeted PVE adapter tests: `npx vitest run tests/pve-request-adapter-service.test.ts tests/pve-task-service.test.ts tests/pve-qemu-config-access-service.test.ts tests/pve-datacenter-status-service.test.ts tests/pve-qemu-config-dto-factory.test.ts tests/pve-datacenter-status-policy.test.ts tests/pve-client.test.ts` (`7` files, `28` tests)
- targeted VM Manage adapter tests: `npx vitest run tests/vm-manage-request-adapter-service.test.ts tests/vm-creation-request-service.test.ts tests/vm-config-update-workflow-service.test.ts tests/vm-deletion-access-service.test.ts tests/vm-deletion-workflow-service.test.ts tests/vm-creation-workflow-service.test.ts tests/vm-config-execution-service.test.ts` (`7` files, `31` tests)
- targeted Template Manage adapter tests: `npx vitest run tests/template-manage-request-adapter-service.test.ts tests/template-config-update-service.test.ts tests/template-deletion-service.test.ts tests/template-clone-service.test.ts tests/template-list-service.test.ts tests/template-conversion-service.test.ts tests/template-audit-service.test.ts` (`7` files, `40` tests)
- targeted CRP adapter tests: `npx vitest run tests/compute-resource-plan-request-adapter-service.test.ts tests/compute-resource-plan-management-service.test.ts tests/compute-resource-plan-policy.test.ts` (`3` files, `19` tests)
- targeted SuperAdmin adapter tests: `npx vitest run tests/super-admin-request-adapter-service.test.ts tests/super-admin-user-management-service.test.ts tests/super-admin-user-mutation-policy.test.ts` (`3` files, `12` tests)
- `npm test` (`182` files, `919` tests)
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
  - verify/logout session behavior service covering verification persistence and logout response behavior.
- VM/PVE refactor has substantial coverage:
  - VM creation, deletion, config update, read/status/network, operation policy, task persistence, resource accounting, PVE task status, PVE QEMU config access, and PVE datacenter status slices are extracted/tested.
- Guacamole refactor has substantial coverage:
  - auth/user lifecycle, connection management, shared preflight, get-or-create config, SSH/RDP/VNC establishment, disconnect, delete/list DTOs, and VM lookup boundaries are extracted/tested.
  - SSH/RDP/VNC establishment and preflight now accept user/request DTO inputs instead of raw Express `Request`.
  - Guacamole connection/disconnect/list/delete request mapping now lives behind `GuacamoleRequestAdapterService`, leaving `GuacamoleService` as a token/permission facade.
- AI service refactor has substantial coverage:
  - AI Box Build job/draft/agent/runtime/run/workspace/provisioning/SSH execution flows are extracted/tested;
  - AI Chat request validation, language policy, hint workflow, platform-guide workflow, VM management workflow, target selection, pending-action flow, and response formatting are extracted/tested.
  - AI Chat VM management now accepts body/user context and calls VM read, VM operation, and VM deletion module ports instead of cloning Express requests or importing service facades.
  - AI Box Build provisioning now calls VM creation workflow DTOs directly instead of constructing an Express-like request.
  - AI Box Build job/run route-to-workflow adapter logic now lives in `AIBoxBuildRequestAdapterService`.
  - `AIBoxBuildService` now shares one request-context helper for params/body/authorization forwarding into the request adapter.
  - AI Chat hint/platform-guide/VM-management route-to-workflow adapter logic now lives in `AIChatRequestAdapterService`.
- Course, Template, VM Box, and Review domains have many extracted/tested service and policy slices, including create/update/list/review/membership/submission/audit/writeup/answer flows.
- Course request adapter mapping is now directly tested with injected workflow ports, and `CourseService` now uses one shared request-context helper for forwarding actor/body/query/params into the adapter.
- VM Box request adapter mapping is now directly tested with injected workflow ports, and `VMBoxService` now uses one shared request-context helper for forwarding actor/body/query/params into the adapter.
- Template list, accessible-template list, and submitted-template detail assembly now live in `TemplateListService`.
- Template list/convert/submit/audit route-to-workflow adapter logic now lives in `TemplateRequestAdapterService`.
  - `TemplateService` now shares one token/error wrapper and request-context forwarding helper for user/admin/superadmin template routes.
- User profile/read facade methods now share a thin auth/error wrapper while delegating to extracted user modules.
- Guacamole SSH/RDP/VNC establishment now shares one service-level adapter helper.
- VM status/network reads now share one service-level actor-context resolver.
- VM read/list/status/network route-to-workflow adapter logic now lives in `VMReadRequestAdapterService`.
- VM operation execution now lives in `VMOperationExecutionService`; `VMOperateService` is a route/auth adapter.
- VM deletion ownership and workflow dispatch now lives in `VMDeletionAccessService`; `VMManageService` delegates delete DTOs.
- PVE request query/body mapping now lives in `PVERequestAdapterService`; `PVEService` is a token/role adapter for PVE workflows.
  - `PVEService` now uses shared request-context forwarding for body/query adapter calls.
- VM Manage create/update/delete body mapping now lives in `VMManageRequestAdapterService`; `VMManageService` is a token/role adapter.
- Template Manage update/delete/clone body mapping now lives in `TemplateManageRequestAdapterService`; `TemplateManageService` is a token/role adapter.
- CRP route params/body mapping now lives in `ComputeResourcePlanRequestAdapterService`; `SuperAdminCRPService` is a token/role adapter.
- SuperAdmin role/CRP assignment body mapping now lives in `SuperAdminRequestAdapterService`; `SuperAdminService` is a token adapter.
- Course and VM Box route-to-workflow adapter logic now lives behind DTO-style request adapter services, leaving their facades as thin auth/error wrappers.
- Class and Chapter route-to-workflow adapter logic now lives behind `CourseStructureRequestAdapterService`, leaving `ClassService` and `ChapterService` as token/error wrappers.
- Safe non-unique indexes were added for common lookup/list paths.
- Unique-constraint hardening remains deferred, but `docs/DATA_HARDENING_UNIQUE_CONSTRAINTS.md` now records staging/production duplicate checks and cleanup order for candidate unique keys.
- `npm run data:check-unique-duplicates` now provides a read-only duplicate preflight command for staging/production runs.

## Service Size Snapshot

Current facade/service file sizes:

| File | Lines | Note |
| --- | ---: | --- |
| `src/service/VMBoxService.ts` | 169 | Thin auth/error wrapper around VM Box request adapter with shared request-context forwarding. |
| `src/service/CourseService.ts` | 157 | Thin auth/error wrapper around Course request adapter with shared request-context forwarding. |
| `src/service/PVEService.ts` | 147 | Thin token/role wrapper around PVE request adapter with shared request-context forwarding. |
| `src/service/GuacamoleService.ts` | 134 | Thin token/permission wrapper around Guacamole request adapter. |
| `src/service/AIChatService.ts` | 125 | Thin auth/error wrapper around AI Chat request adapter. |
| `src/service/VMManageService.ts` | 120 | Thin token/role wrapper around VM Manage request adapter. |
| `src/service/UserService.ts` | 118 | Thin auth/error wrapper around profile/read modules. |
| `src/service/AIBoxBuildService.ts` | 100 | Thin token wrapper around AI Box Build request adapter with shared request-context forwarding. |
| `src/service/TemplateService.ts` | 93 | Thin token wrapper around Template request adapter with shared request-context forwarding. |
| `src/service/VMService.ts` | 90 | Thin read facade around VM read request adapter. |
| `src/service/ChapterService.ts` | 89 | Thin token wrapper around course structure request adapter. |
| `src/service/SuperAdminCRPService.ts` | 84 | Thin token/role wrapper around CRP request adapter. |
| `src/service/VMOperateService.ts` | 81 | Thin request adapter delegating operation execution. |
| `src/service/AuthService.ts` | 74 | Thin token wrapper around Auth workflow/session services. |
| `src/service/TemplateManageService.ts` | 68 | Thin token/role wrapper around Template Manage request adapter. |
| `src/service/SuperAdminService.ts` | 61 | Thin token wrapper around SuperAdmin request adapter. |
| `src/service/ClassService.ts` | 56 | Thin token wrapper around course structure request adapter. |

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
   - Candidate targets: smaller wrapper cleanup in remaining facades where controller response shapes can stay unchanged.
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
4. `refactor vm manage request adapter service`
5. `refactor template manage request adapter service`
6. `refactor crp request adapter service`
7. `refactor super admin request adapter service`
8. `refactor auth session service`
9. `refactor course structure request adapter service`
10. `refactor template request adapter service`
11. `refactor vm read request adapter service`
12. `refactor ai box build request adapter service`
13. `refactor ai chat request adapter service`
14. `refactor guacamole request adapter service`
15. `refactor vm box request adapter coverage`
16. `refactor course request adapter coverage`
17. `refactor pve service request context forwarding`
18. `refactor template service request context forwarding`
19. `refactor ai box build service request context forwarding`
20. `docs update backend refactor progress`

After each slice, update `docs/REFACTOR_OPTIMIZATION_PLAN.md` and this file with the new verification result.
