# Backend Refactor and Optimization Plan

Date: 2026-05-25
Scope: `/home/tkuimwd/Documents/GitHub/TheProject-Backend`

## Goals

- Restore a clean TypeScript baseline and keep it clean in CI.
- Reduce risk in VM, PVE, Guacamole, AI Chat, and AI Box Build flows.
- Separate HTTP request handling, authentication, business logic, data access, and external integrations.
- Improve observability without leaking credentials, tokens, or sensitive URLs.
- Make high-risk workflows testable before deeper rewrites.

## Current Signals

- Initial `npx tsc --noEmit` failure from merge conflict markers in `src/service/VMManageService.ts` has been resolved.
- Several service files are too large and mix responsibilities:
  - `src/service/AIBoxBuildService.ts`: about 2242 lines.
  - `src/service/GuacamoleService.ts`: about 1775 lines.
  - `src/service/VMManageService.ts`: about 1555 lines.
  - `src/service/VMBoxService.ts`: about 1354 lines.
  - `src/service/AIChatService.ts`: about 1201 lines.
  - `src/service/CourseService.ts`: about 1148 lines.
- Many services accept Express `Request` directly and perform body parsing, authentication, database access, and orchestration in the same method.
- Environment variables are read directly from many modules.
- Some logs expose sensitive material or full connection/session details.
- PVE calls share a generic fetch helper that disables TLS verification through global process state.
- Mongoose schemas have limited indexes for common access patterns.
- `package.json` scripts and dependencies need cleanup for build, CI, and runtime clarity.

## Progress Snapshot

- Phase 0 is complete for compile baseline, script cleanup, immediate sensitive log redaction, and backend `console.*` cleanup across service/utils/controller/router code paths.
- Phase 1 is partially complete: typed env config, request-scoped TLS behavior, centralized dotenv loading, tested CORS whitelist policy, `PVEClient`, `GuacamoleApiClient`, `OpenAIClientFactory`, `OpenAICompatibleChatClient`, and `OpenCodeRunner` are in place. Auth token user ID validation now prevents malformed token payload IDs from reaching Mongoose lookups. Auth registration input/conflict rules and the registration workflow service are extracted/tested, and registration duplicate checks use one batched identity lookup. Auth login workflow, wrong-attempt lockout, unverified-email resend, and token response behavior are extracted/tested. Auth forgot-password reset email, throttle, token validation, password policy, hashing, persistence, and invalid method behavior are extracted/tested behind a DTO-style workflow service. Auth verify/logout session behavior is extracted/tested behind `AuthSessionService`. User profile/password/avatar and user courses/CRP/SuperAdmin lookup workflow services are extracted/tested. More domain-specific service splits remain.
- Phase 3 has early slices complete: PVE calls are centralized through `PVEClient`, PVE QEMU config DTO projection and datacenter node status projection are extracted/tested, PVE VM task status/list/refresh/cleanup workflow service is extracted/tested, VM quota policy and used-resource initialization plus usage increment/reclaim payloads are extracted/tested, VM persistence payload rules, a VM ownership repository, a VM task repository, a VM resource repository, a VM resource accounting service, and a VM creation source repository are extracted/tested, VM operation permission/status rules and shared operation execution are extracted/tested, VM Cloud-Init credential selection/update validation is extracted/tested, VM config update request/resource delta/success response rules, VM config update workflow service, VM config operation metadata and shared PVE operation execution for name/CPU/memory/disk/cloud-init are extracted/tested, VM task initialization/status/step update/PVE refresh mapping/DTO rules are extracted/tested, VM creation request validation payload/identity rules, VM creation cleanup/retention helpers, VM creation response payload/message rules, shared VM creation clone/config/register workflow service, shared VM config execution workflow, and VM deletion workflow are extracted/tested or consolidated, VM disk readiness classification is extracted/tested, VM deletion ownership/status preconditions, PVE API failure messages, response classification, and response DTO rules are extracted/tested, VM list DTO assembly with batched owner lookup is extracted/tested, VM read/status/network workflow service and request adapter service are extracted/tested, and VM status/network read paths validate VM IDs before DB lookup. `VMManageService` no longer directly references the VM, VM task, user, used-resource, compute-plan, template, or VM box Mongoose models, and `PVEService` no longer directly owns VM task model queries.
- Phase 4 has early slices complete: Guacamole HTTP calls now go through `GuacamoleApiClient`; direct URL construction, SSH/RDP/VNC connection profile construction, terminal font-size normalization, connection target validation, disconnect/delete connection ID validation, token response parsing, user lookup classification, user creation payloads, CREATE_CONNECTION permission patch/verification rules, auth/user lifecycle service, connection list/delete management service, delete permission policy, VM guest network IP selection, connection preflight messages/display-name fallback, shared SSH/RDP/VNC preflight lifecycle service, same-name connection lookup, create/delete-response classification, disconnect/delete success response payloads, protocol-specific create failure messages, shared get-or-create config service, established connection DTO/message assembly, shared established connection response finalization, shared SSH/RDP/VNC establishment workflow service, Guacamole request adapter service, and user connection list DTO projection are extracted/tested. Guacamole VM lookup now goes through the shared VM repository. SSH/RDP/VNC establishment and preflight now accept actor/request DTO inputs instead of raw Express `Request`; connection/disconnect/list/delete route mapping now lives behind `GuacamoleRequestAdapterService`.
- Phase 5 has initial slices complete: OpenAI/OpenAI-compatible clients, OpenCode runner, AI Box Build job request/access validation, AI Box Build job repository boundary, AI Box Build job draft workflow service, AI Box Build job management workflow service, AI Box Build request adapter service, AI Box Build artifact normalization and validation helpers, AI Box Build agent response parsing/history/failure/split-repair aggregation helpers, AI Box Build agent/model workflow service, AI Box Build DTO assembly, AI Box Build Markdown/baseline rules, AI Box Build reference bundle parsing, fallback sanitization, and fallback workspace payload rules, AI Box Build OpenCode model/config/prompt rules, AI Box Build targeted repair rules, AI Box Build stale-job detection rules, AI Box Build execution-state rules, AI Box Build run queued/completion/failure state and persistence rules, AI Box Build provisioning/network log and IP selection rules, AI Box Build VM provisioning/boot/network workflow service, AI Box Build SSH script execution command planning and execution service, AI Box Build runtime preflight workflow service, AI Box Build run execution workflow service, AI Box Build workspace context and artifact-refresh payload assembly, AI Box Build workspace filesystem lifecycle service, AI Box Build generated-script readiness/fallback file management, AI Box Build runtime preflight rules, AI Box Build run request validation, workspace path safety, run-log redaction/tailing plus append/update payload rules, AI Box Build service pass-through wrapper cleanup, AI Chat request adapter service, AI Chat request validation and prompt-injection input sanitization, AI Chat language policy, AI VM intent fallback/classifier parsing, AI VM target/response formatting, AI VM pending-action timing/pruning, and the AI Chat VM management workflow service are extracted/tested. `AIBoxBuildService` no longer directly references the AI Box Build job or VM Mongoose models. `AIChatService` is now a thin owner for auth/error handling while hint/platform-guide/VM-management request mapping lives behind the AI Chat request adapter. AI Chat VM management now accepts body/user context and calls VM read/operate/delete DTO methods instead of cloning Express requests.
- Phase 8 is active: Vitest is wired with focused unit tests for PVE, redaction, VM resource policy, Guacamole API request behavior, and OpenAI client behavior.
- Phase 8 also has a minimal GitHub Actions workflow for install, typecheck, tests, build, and audit.
- Phase 7 has safe slices complete: non-unique indexes were added for common user, VM, VM task, and AI box build lookup/list paths, `docs/DATA_HARDENING_UNIQUE_CONSTRAINTS.md` records the duplicate checks and cleanup sequencing required before deferred unique constraints are added, and `npm run data:check-unique-duplicates` provides the read-only duplicate preflight command.
- Phase 6 has early slices complete: Course/Class/Chapter create/update content validation and shared ID validation, Class management workflow service, Chapter management service, Course read/menu/first-template workflow service, Course create/update/delete workflow service, Course create/update persistence and response payload rules, Course repository boundary, Course request adapter service, Course structure request adapter service for class/chapter route mapping, Course class/chapter repository boundaries for menu/delete/approval/template-selection/submission flows, Course access/membership/review permission rules and membership ID update rules, Course membership/invitation workflow service, Course review request validation and workflow service, Course lifecycle/status workflow service, Course list/catalog workflow service, Course submission readiness and invitation rules, Course listing/page/menu/template-selection DTO assembly with batched lookup inputs, Course invite recipient filtering with batched user lookup, Template request adapter service for list/convert/submit/audit route mapping, Template list/submitted-template workflow service with batched template/user lookup, Template config update workflow service, Template conversion workflow service, Template submission create workflow service, Template deletion workflow service, Template submitted-template audit workflow service, Template clone workflow service, Course and VM Box rating validation/summary logic, shared Course/VM Box review DTO assembly with batched reviewer lookup, shared Course/VM Box review repository boundary, shared Course/VM Box user lookup/update repository boundary, shared VM Box template lookup repository boundary, shared review create/update persistence payload rules, Course and VM Box review ownership/membership/response rules, VM Box request adapter service with direct mapping coverage, VM Box review workflow service, Course status transition rules, template/VM Box submission audit validation, VM Box submission audit workflow service/update/approved payload/email rules, VM Box submission create workflow service/validation/persistence/response rules, VM Box submitted-box repository boundary, expanded VM Box published-box repository boundary, VM Box writeup repository boundary and workflow service, VM Box AI assistant setting validation/permission/workflow service, VM Box review request validation, VM Box listing DTO assembly and workflow service with batched submitter/template/published-box/writeup-count lookup and shared template-info projection, VM Box template-info PVE fallback workflow service, VM Box answer request/status/evaluation/access/submission-outcome validation plus answer-record and box repository boundaries/workflow service, and VM Box writeup submission/review/visibility/query/DTO/permission validation with shared batched writeup DTO lookup are extracted/tested. `CourseService`, `ClassService`, `ChapterService`, `VMBoxService`, `TemplateService`, and `UserService` are now thin auth/error facades, and `VMBoxService` uses shared request-context forwarding for adapter calls.
- Phase 9 has an initial dependency cleanup complete: unused `file-type` was removed from runtime dependencies, built-in Node packages are not installed as dependencies, type packages are dev-only, and `engines.node` documents Node 20+.
- User profile lookup by ID now validates target IDs and enforces the documented SuperAdmin-only boundary.
- SuperAdmin user mutation flows now use the shared SuperAdmin token validator and a tested assignable-role policy.
- Phase 9 is complete for current scope: legacy webpack/Karma tooling and unused runtime dependencies were removed, scripts are standardized, and the required Node runtime is documented in `package.json` engines.

## Phase 0: Compile and Safety Baseline

Priority: Critical

Tasks:

- Resolve the merge conflict in `src/service/VMManageService.ts`.
- Preserve both intended behaviors:
  - Keep `_cleanupOrphanCloudInitDisk(pve_node, pve_vmid, storage)`.
  - Keep `_updateUserOwnedVMs(userId, pve_vmid, pve_node, fromTemplateId?: string)`.
- Add scripts:
  - `typecheck`: `tsc --noEmit`
  - `build`: `tsc`
  - Keep watch behavior under a separate script such as `build:watch`.
- Run `npm run typecheck` and record the remaining errors, if any.
- Remove or redact immediate sensitive logs:
  - MongoDB connection URL with password.
  - Guacamole direct session URLs and tokens.
  - Cloud-init passwords, API tokens, and generated credentials.
- Replace stray `console.log`, `console.error`, and `console.warn` in services with `logger` calls.

Acceptance criteria:

- `npm run typecheck` no longer fails because of conflict markers.
- No log line prints a database password, Guacamole token, OpenAI key, PVE token, or full direct session URL.
- Build/watch scripts clearly separate one-shot CI use from development watch mode.

## Phase 1: Configuration and External Clients

Priority: High

Tasks:

- Add a typed config module, for example `src/config/env.ts`.
- Validate required environment variables at startup.
- Group config by domain:
  - `server`
  - `database`
  - `frontend`
  - `pve`
  - `guacamole`
  - `openai`
  - `opencode`
  - `logging`
- Replace scattered `process.env.*` reads with imports from the config module.
- Create dedicated clients:
  - `PVEClient`
  - `GuacamoleApiClient`
  - `OpenAIClientFactory`
  - `OpenCodeRunner`
- Move TLS, timeout, retry, auth headers, response parsing, and redaction into those clients.
- Remove global mutation of `process.env.NODE_TLS_REJECT_UNAUTHORIZED`.
- Make CORS origin configurable by environment whitelist instead of `origin: "*"`.

Acceptance criteria:

- Startup fails fast with a clear message when required config is missing.
- PVE, Guacamole, OpenAI, and OpenCode calls have a single owner each.
- External API errors are normalized before reaching service workflows.
- No shared helper changes process-wide TLS behavior.

## Phase 2: Service Boundary Cleanup

Priority: High

Target design:

- Routes only map URL and HTTP methods.
- Controllers parse request data and call services.
- Auth middleware attaches the authenticated actor to the request.
- Services accept DTOs and actor context, not raw Express `Request`.
- Repositories own Mongoose queries and persistence details.
- External clients own network protocols.

Tasks:

- Add common request context types:
  - `ActorContext`
  - `AuthenticatedRequest`
  - Role-aware permission helpers.
- Move repeated token validation out of service methods.
- Validate auth token user IDs before user lookups.
- Introduce DTOs for high-traffic endpoints:
  - VM create/update/delete.
  - VM operate start/shutdown/stop/reboot/reset.
  - Guacamole SSH/RDP/VNC connection creation.
  - Course and VM box review/rating flows.
- Add centralized response/error helpers:
  - `AppError`
  - `toHttpResponse`
  - typed `ApiResponse<T>`.
- Keep the existing response shape initially to avoid frontend breakage.

Acceptance criteria:

- New or touched service methods do not accept Express `Request`.
- Controllers become thin and predictable.
- Auth/permission failures are handled consistently.
- Existing frontend API response shape remains compatible.

## Phase 3: VM and PVE Domain Refactor

Priority: High

Proposed modules:

- `src/modules/vm/VMProvisioningWorkflow.ts`
- `src/modules/vm/VMConfigWorkflow.ts`
- `src/modules/vm/VMDeletionWorkflow.ts`
- `src/modules/vm/VMTaskService.ts`
- `src/modules/vm/VMResourceService.ts`
- `src/modules/vm/VMRepository.ts`
- `src/modules/pve/PVEClient.ts`
- `src/modules/pve/PVETaskPoller.ts`
- `src/modules/pve/PVEQemuMapper.ts`

Tasks:

- Split `VMManageService` by workflow:
  - Create from template.
  - Create from box template.
  - Update config.
  - Delete VM.
- Extract task creation, step updates, and cleanup into `VMTaskService`.
- Extract compute resource accounting into `VMResourceService`.
- Extract VM persistence into `VMRepository`.
- Split `VMUtils` into PVE client, VM lifecycle helpers, guest-agent helpers, disk/cloud-init helpers, and validation helpers.
- Make VM creation and deletion cleanup idempotent where possible.
- Add focused tests for:
  - Resource limit calculation.
  - Resource reclaim after delete.
  - Failed clone/config cleanup.
  - Task step progression.
  - `fromTemplateId` persistence.

Acceptance criteria:

- `VMManageService` is reduced to orchestration or replaced by smaller workflow classes.
- PVE API details no longer appear in VM service methods.
- Resource usage updates are covered by tests.
- VM lifecycle failures return consistent, user-safe errors.

## Phase 4: Guacamole Refactor

Priority: High

Proposed modules:

- `src/modules/guacamole/GuacamoleApiClient.ts`
- `src/modules/guacamole/GuacamoleAuthService.ts`
- `src/modules/guacamole/GuacamoleUserService.ts`
- `src/modules/guacamole/GuacamoleConnectionService.ts`
- `src/modules/guacamole/ConnectionProfileFactory.ts`

Tasks:

- Consolidate duplicated SSH/RDP/VNC connection creation logic.
- Use one API client for token, user, connection, permission, and deletion requests.
- Replace callback-style HTTPS request blocks with async functions.
- Redact token and direct URL logs.
- Keep direct URL creation in one function with tests.
- Move VM permission and VM network resolution to VM domain services.

Acceptance criteria:

- SSH/RDP/VNC flows share the same validation and connection lifecycle.
- Guacamole token handling is centralized.
- No service logs full direct session URLs.
- Connection deletion permission checks are isolated and testable.

## Phase 5: AI Service Refactor

Priority: Medium

AI Chat tasks:

- Extract language detection and formatting helpers from `AIChatService`.
- Extract VM management intent classification into its own service.
- Replace in-memory pending VM actions with a short-lived persistence layer if multi-process deployment is expected.
- Add tests for VM intent parsing fallback and confirmation flow.

AI Box Build tasks:

- Split `AIBoxBuildService` into:
  - `AIBoxBuildJobService`
  - `AIBoxBuildAgentService`
  - `AIBoxBuildArtifactValidator`
  - `AIBoxBuildWorkspaceService`
  - `AIBoxBuildRunner`
  - `AIBoxBuildProvisioningService`
- Keep secret redaction close to process execution and model output storage.
- Make stale-job handling explicit and schedulable.
- Add tests for artifact parsing, validation, redaction, and workspace path safety.

Acceptance criteria:

- AI workflows can be tested without launching VMs or external model calls.
- Model calls are isolated behind interfaces.
- Run logs are redacted consistently.
- Workspace deletion cannot escape the configured workspace root.

## Phase 6: Course and VM Box Domain Cleanup

Priority: Medium

Tasks:

- Split course CRUD, publishing/review, enrollment, ratings, and menu/page DTO assembly.
- Split VM box submission, audit, reviews, writeups, answers, and public listing.
- Introduce repositories for courses, classes, chapters, reviews, boxes, writeups, and answer records.
- Create shared rating/review helper for Course and VM Box.
- Add indexes for common list and lookup paths.

Acceptance criteria:

- Course and VM box services no longer exceed a single broad responsibility.
- Rating/review behavior is consistent between courses and boxes.
- Common list endpoints have predictable indexed queries.

## Phase 7: Data Model and Indexing

Priority: Medium

Suggested indexes:

- Users:
  - `email` unique.
  - `username` unique.
  - `role`.
  - `course_ids`.
  - `owned_vms`.
- VMs:
  - `{ owner: 1 }`
  - `{ pve_node: 1, pve_vmid: 1 }` unique if PVE VM IDs are unique per node.
  - `{ is_box_vm: 1, box_id: 1 }`
  - `{ fromTemplateId: 1 }`
- VM tasks:
  - `{ user_id: 1, created_at: -1 }`
  - `{ status: 1, updated_at: -1 }`
  - `{ task_id: 1 }` unique.
- AI box build jobs:
  - `{ requester_user_id: 1, updated_at: -1 }`
  - `{ execution_status: 1, updated_at: 1 }`
- Reviews/writeups:
  - Keep current box writeup indexes.
  - Add equivalent indexes for course/box reviews if query volume requires it.

Tasks:

- Confirm existing duplicate data before adding unique indexes.
- Add migrations or cleanup scripts for duplicate emails/usernames/task IDs.
- Decide which string IDs should become `ObjectId` references over time.

Acceptance criteria:

- Indexes match the most frequent queries.
- Unique constraints are added only after data cleanup.
- Query performance can be measured before and after with explain plans for key endpoints.

## Phase 8: Testing and CI

Priority: Medium

Tasks:

- Add a test runner suitable for backend unit tests, for example Jest or Vitest.
- Start with pure unit tests for:
  - PVE response mapping.
  - VM resource accounting.
  - VM task status updates.
  - Request DTO validation.
  - Secret redaction.
  - Guacamole direct URL encoding.
  - AI artifact parser and validator.
- Add integration tests with mocked external clients.
- Add CI steps:
  - `npm ci`
  - `npm run typecheck`
  - `npm test`
  - optional lint once lint config is introduced.

Acceptance criteria:

- High-risk business rules have tests before major rewrites.
- External services are mocked in normal CI.
- CI fails on TypeScript errors.

## Phase 9: Dependency and Runtime Cleanup

Priority: Low to Medium

Tasks:

- Move type packages to `devDependencies`.
- Remove Node built-in packages from `dependencies`:
  - `fs`
  - `http`
  - `https`
  - `path`
- Remove `node` from `dependencies`; document required Node version in `engines` or `.nvmrc`.
- Audit unused packages such as legacy Karma/Jasmine/Webpack dependencies if they are not used by backend tests/build.
- Standardize npm scripts:
  - `dev`
  - `build`
  - `build:watch`
  - `start`
  - `typecheck`
  - `test`

Acceptance criteria:

- Runtime dependencies reflect actual production needs.
- Backend can be built with a one-shot command.
- Required Node version is explicit.

## Suggested Execution Order

1. Phase 0: compile and safety baseline.
2. Phase 1: typed config and external clients.
3. Phase 3: VM and PVE refactor.
4. Phase 4: Guacamole refactor.
5. Phase 8: testing and CI, started early and expanded throughout.
6. Phase 5: AI service refactor.
7. Phase 6: Course and VM Box cleanup.
8. Phase 7: data model and indexes.
9. Phase 9: dependency/runtime cleanup.

## First Sprint Checklist

- [x] Resolve `VMManageService.ts` conflict.
- [x] Add `typecheck` and one-shot `build` scripts.
- [x] Run `npm run typecheck`.
- [x] Add typed env config.
- [x] Replace sensitive Mongo and Guacamole logs.
- [x] Replace global TLS bypass in shared fetch helper.
- [x] Add initial `PVEClient` wrapper.
- [x] Add tests for secret redaction and PVE utility behavior.
- [x] Add tests for PVE client token selection.
- [x] Add tests for VM resource policy decisions.
- [x] Extract and test VM used-resource increment/reclaim update payload rules.
- [x] Extract and test VM persistence create/ownership/box metadata update payload rules.
- [x] Add and test a VM ownership repository for VM record create/delete, owned VM attach/detach, and box metadata updates.
- [x] Add `GuacamoleApiClient` and migrate Guacamole token/user/permission/connection API calls through it.
- [x] Add tests for Guacamole form auth, auth headers, and active-connection PATCH behavior.
- [x] Fix VNC connectivity failure handling.
- [x] Add `OpenAIClientFactory` and migrate `AIChatService` OpenAI SDK construction through it.
- [x] Add `OpenAICompatibleChatClient` and migrate AI Box Build chat-completion fetch/fallback behavior through it.
- [x] Add tests for OpenAI SDK config, OpenAI-compatible request payloads, model fallback, and non-2xx errors.
- [x] Add `OpenCodeRunner` and migrate AI Box Build command execution/summarization through it.
- [x] Add tests for command execution capture and command-result summarization.
- [x] Move AI Box Build OpenAI/OpenCode runtime settings to typed env config.
- [x] Add safe non-unique indexes for common User, VM, VM task, and AI box build queries.
- [x] Add safe non-unique indexes for shared review lookups.
- [x] Add tests that assert expected schema indexes are registered.
- [x] Add backend CI workflow for `npm ci`, typecheck, tests, build, and audit.
- [x] Add shared `ReviewPolicy` for Course/VM Box rating input validation and rating summary calculation.
- [x] Extract and test shared review create/update persistence payload rules.
- [x] Remove service-layer `console.*` calls from touched Course/VM Box paths.
- [x] Remove service-layer `console.*` calls from VM, PVE, and VM management paths.
- [x] Remove service-layer `console.*` calls from template management and VM operation paths.
- [x] Remove service-layer `console.*` calls and full object dumps from template listing/conversion/audit paths.
- [x] Remove remaining `console.*` calls from service/utils/controller/router paths, including VM utility, fetch helper, CRP, chapter, and mail sender code.
- [x] Centralize remaining config reads for frontend/backend URLs, JWT secret, homepage path, VM boot network normalization, and AI Box Build workspace roots.
- [x] Extract and test CORS whitelist policy.
- [x] Extract and test Auth registration input/conflict policy.
- [x] Extract and test Auth login workflow orchestration.
- [x] Extract and test User profile/password/avatar workflow orchestration.
- [x] Extract and test User courses/CRP/SuperAdmin lookup workflow orchestration.
- [x] Extract and test VM operation permission/status policy.
- [x] Consolidate VM operation service execution through a shared operation helper.
- [x] Extract and test PVE QEMU basic/detailed config DTO projection.
- [x] Extract and test PVE datacenter node status DTO projection.
- [x] Validate VM operation target IDs before Mongoose queries.
- [x] Add shared ObjectId input validation and apply it to CRP ID endpoints.
- [x] Apply shared ObjectId validation to template management `template_id` endpoints.
- [x] Apply shared ObjectId validation to template submit/audit and VM-to-template conversion endpoints.
- [x] Apply shared ObjectId validation to superadmin role/CRP assignment IDs.
- [x] Apply shared ObjectId validation to Course/Class/Chapter route IDs while preserving response messages.
- [x] Add tested CRP payload validation for create/update resource-plan flows.
- [x] Add safe non-unique index for compute resource plan name lookups.
- [x] Add shared pagination validation and apply it to PVE task list queries.
- [x] Apply shared ObjectId validation to PVE QEMU config VM lookups.
- [x] Extract and test VM list DTO assembly and batch owner lookup inputs.
- [x] Extract and test VM read/status/network workflow orchestration.
- [x] Extract and test VM creation validation payload and identity rules.
- [x] Extract and test VM deletion success/error response payload rules.
- [x] Extract and test VM deletion ownership and power-state precondition rules.
- [x] Extract and test VM deletion PVE API failure message rules.
- [x] Extract and test AI Box Build run request validation.
- [x] Extract and test AI Box Build runtime preflight command workflow.
- [x] Extract and test AI Box Build execution-state/delete/start rules.
- [x] Extract and test AI Box Build run completion/failure persistence payload rules.
- [x] Extract and test AI Box Build run execution workflow orchestration.
- [x] Extract and test AI Box Build provisioning/network log and IP selection rules.
- [x] Extract and test AI Box Build SSH script execution command planning.
- [x] Extract and test AI Box Build workspace context assembly.
- [x] Extract and test AI Box Build workspace artifact-refresh update payload assembly.
- [x] Extract and test AI Box Build generated-script readiness rules.
- [x] Apply shared ObjectId validation to AI Box Build public `job_id` endpoints.
- [x] Extract and test AI Box Build workspace/reference path safety policy.
- [x] Extract and test AI Box Build run-log redaction/tailing policy.
- [x] Extract and test AI Box Build run-log append and Mongo push-update payload rules.
- [x] Extract and test AI Box Build split repair response aggregation.
- [x] Remove AI Box Build pass-through private wrappers after equivalent policy/factory tests existed.
- [x] Add and test an AI Box Build job repository for job create/list/get/delete/update/stale/queue persistence.
- [x] Extract and test AI Box Build draft create/update workflow orchestration.
- [x] Extract and test AI Box Build job management workflow orchestration.
- [x] Extract and test AI Box Build OpenCode workspace prompt rules.
- [x] Extract and test AI Box Build reference fallback sanitization and writeup normalization.
- [x] Extract and test AI Box Build reference fallback workspace payload assembly.
- [x] Extract and test AI Chat VM target resolution and response formatting.
- [x] Extract and test AI Chat VM pending-action timing and pruning rules.
- [x] Extract and test AI Chat VM classifier output parsing and action normalization.
- [x] Extract and test AI Chat prompt-injection input sanitization.
- [x] Extract and test AI Chat VM management workflow orchestration and confirmation execution.
- [x] Extract and test VM Box answer VM access checks.
- [x] Add and test VM Box answer-record and box lookup repositories for answer/review/writeup flows.
- [x] Extract and test Course listing DTO assembly and batch submitter lookup inputs.
- [x] Extract and test Course read/menu/first-template workflow orchestration.
- [x] Extract and test Course create/update persistence and response payload rules.
- [x] Extract and test Course create/update/delete workflow orchestration.
- [x] Add and test Course repository for create/find/update/delete/list persistence.
- [x] Add and test Course class/chapter repositories for menu/delete/approval/template-selection/submission persistence.
- [x] Extract and test Class management workflow orchestration.
- [x] Extract and test Chapter management workflow orchestration.
- [x] Optimize Course invite recipient lookups with tested batch filtering.
- [x] Extract and test Template listing DTO assembly and batch submitter lookup inputs.
- [x] Optimize VM Box list submitter lookups with tested submitter-map helpers.
- [x] Optimize VM Box list template lookups with tested template-map helpers.
- [x] Extract and test VM Box QEMU template-info projection and consolidate VM Box list template-info loading.
- [x] Extract and test VM Box template-info PVE fallback workflow service.
- [x] Optimize submitted VM Box published-box lookups with tested linked/fallback maps.
- [x] Optimize VM Box public writeup counts with tested count-map helpers.
- [x] Optimize VM Box writeup list DTO lookups with tested batch helper inputs.
- [x] Optimize submitted Template detail lookups with tested template/user maps.
- [x] Extract and test Template config update workflow orchestration.
- [x] Extract and test Template VM-to-template conversion workflow orchestration.
- [x] Extract and test Template submission create workflow orchestration.
- [x] Extract and test Template deletion workflow orchestration.
- [x] Extract and test Template submitted-template audit workflow orchestration.
- [x] Extract and test Template clone workflow orchestration.
- [x] Add and test shared user and VM template lookup repositories for Course/VM Box DTO/audit/email/membership flows.
- [x] Extract and test shared review DTO assembly with batched reviewer lookup inputs.
- [x] Add and test shared review repository for Course/VM Box review create/list/find/delete persistence.
- [x] Extract and test VM Box review ownership/membership/rating response rules.
- [x] Extract and test VM Box submission audit update, approved-box payload, and notification payload rules.
- [x] Extract and test VM Box submission audit workflow orchestration.
- [x] Extract and test VM Box submission create persistence and response payload rules.
- [x] Extract and test VM Box submission create workflow orchestration.
- [x] Add and test VM Box submitted-box repository for create/list/find/status/AI-assistant persistence.
- [x] Expand and test VM Box repository for public/list/owned/published lookup and approved-box creation persistence.
- [x] Add and test VM Box writeup repository for create/list/find/active-check/public-count persistence.
- [x] Consolidate VM Box answer record loading and extract/test answer submission outcome rules.
- [x] Extract and test AI Box Build run queued/completion/failure transition rules.
- [x] Extract and test AI Box Build workspace filesystem lifecycle service.
- [x] Extract and test AI Box Build SSH script execution service.
- [x] Extract and test Course review ownership/membership/rating response rules.
- [x] Extract and test Course review create/list/update/delete request validation.
- [x] Extract and test VM Box review workflow service for create/list/update/delete orchestration.
- [x] Extract and test VM Box writeup workflow service for submit/list/review/visibility orchestration.
- [x] Extract and test VM Box AI assistant setting workflow orchestration.
- [x] Extract and test Course membership ID update rules.
- [x] Extract and test Course membership/invitation workflow orchestration.
- [x] Extract and test Course menu DTO and first-template selection rules.
- [x] Extract and test Course page DTO assembly.
- [x] Extract and test Guacamole direct URL construction.
- [x] Extract and test Guacamole auth token response parsing.
- [x] Extract and test Guacamole user lookup, creation, and permission payload rules.
- [x] Extract and test Guacamole SSH/RDP/VNC connection profile construction.
- [x] Extract and test Guacamole same-name connection lookup and create-response classification.
- [x] Consolidate Guacamole SSH/RDP/VNC get-or-create config flow.
- [x] Extract and test Guacamole delete-response classification.
- [x] Extract and test Guacamole disconnect/delete success response payload rules.
- [x] Extract and test Guacamole established connection DTO assembly.
- [x] Extract and test Guacamole established connection response messages and shared finalization.
- [x] Extract and test Guacamole user connection list DTO projection.
- [x] Extract and test Guacamole connection preflight messages and VM display-name fallback.
- [x] Consolidate Guacamole SSH/RDP/VNC VM permission/status/network/connectivity/auth preflight lifecycle.
- [x] Route Guacamole VM permission lookup through the shared VM repository.
- [x] Consolidate Guacamole SSH/RDP/VNC config lookup, established DTO, success log, and response finalization lifecycle.
- [x] Extract and test Guacamole SSH/RDP/VNC connection establishment workflow orchestration.
- [x] Extract and test Guacamole get-or-create connection config service.
- [x] Extract and test Guacamole auth/user lifecycle service.
- [x] Extract and test Guacamole connection list/delete management service.
- [x] Remove unused runtime dependency `file-type` after source/test import scan.
- [x] Apply shared ObjectId validation to VM management create/update/delete/box-create IDs.
- [x] Extract and test VM creation cleanup/retention helpers.
- [x] Extract and test VM disk readiness classification.
- [x] Extract and test VM task PVE refresh status mapping.
- [x] Extract and test VM task with-PVE-status DTO projection.
- [x] Add and test a VM task repository for task create/update/list/delete persistence.
- [x] Extract and test PVE VM task status/list/refresh/cleanup workflow service.
- [x] Extract and test VM used-resource initialization payloads.
- [x] Extract and test VM config operation metadata and consolidate PVE operation execution.
- [x] Extract and test VM config execution service for cloned-VM and update-config step progression.
- [x] Extract and test VM config update workflow orchestration.
- [x] Extract and test VM resource accounting service for create/update quota checks and usage/reclaim updates.
- [x] Extract and test VM deletion workflow service for PVE delete, task wait, resource reclaim, and DB cleanup.
- [x] Add and test a VM resource repository for used-resource updates, get-or-create, and compute-plan lookup.
- [x] Add and test a VM creation source repository for template and VM box lookup.
- [x] Extract and test VM config update success response payload rules.
- [x] Extract and test VM creation response payload and stable message rules.
- [x] Consolidate VM creation clone/config/register/cleanup workflow shared by template and box creation.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `npm audit --audit-level=moderate`.

## Risks and Guardrails

- Do not change frontend response contracts unless frontend changes are coordinated.
- Do not rewrite every service at once; refactor one workflow with tests, then repeat.
- Do not add unique indexes until production/staging data has been checked for duplicates.
- Do not remove environment variables until deployment scripts and `.env.example` are updated.
- Keep PVE, Guacamole, OpenAI, and OpenCode calls behind interfaces so local testing does not require live infrastructure.

## Execution Log

### 2026-05-25

- Resolved the VM management merge conflict while preserving cloud-init orphan disk cleanup and `fromTemplateId?: string`.
- Added typed environment configuration in `src/config/env.ts`.
- Switched server, logging, MongoDB, PVE endpoint, Gmail, and Guacamole config reads toward the typed env module.
- Redacted MongoDB connection logging and removed Guacamole direct-session URL / credential-heavy debug logs.
- Replaced process-wide TLS mutation in the shared unauthorized fetch helper with request-scoped HTTPS agent behavior.
- Added one-shot `build`, `typecheck`, and `test` scripts.
- Added Vitest and initial tests for PVE utility behavior and secret redaction.
- Removed unused webpack/Karma tooling and stale `webpack.config.js`.
- Upgraded security-sensitive dependencies including `bcrypt` and `nodemailer`.
- Removed unused runtime dependencies and moved type-only packages to `devDependencies`.
- Verified:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm audit --audit-level=moderate`

### 2026-05-25 Continued

- Added `src/modules/pve/PVEClient.ts` to centralize PVE token selection and request ownership.
- Migrated `src/utils/VMUtils.ts` PVE calls through the new PVE client adapter.
- Moved PVE token constants to the typed env config.
- Added `tests/pve-client.test.ts` for token/header behavior.
- Added `src/modules/vm/VMResourcePolicy.ts` for pure VM quota policy checks.
- Rewired `VMManageService` create/update resource checks to use `VMResourcePolicy`.
- Added `tests/vm-resource-policy.test.ts` for per-VM limits, total limits, and update delta behavior.
- Migrated remaining direct PVE calls in `PVEService`, `VMManageService`, and `AIBoxBuildService` to `PVEClient`.
- Removed stale PVE token imports from VM-facing services.
- Confirmed direct `callWithUnauthorized` usage now remains only in Guacamole-specific flows, pending the Guacamole client refactor phase.

### 2026-05-25 Guacamole Client Slice

- Added `src/modules/guacamole/GuacamoleApiClient.ts` for token, user, permission, connection list/create/get/delete, and active connection kill requests.
- Migrated `GuacamoleService` token creation, user existence/create, permission patch/verify, SSH/RDP/VNC connection creation, connection listing, active disconnect, permission lookup, and delete flows to `GuacamoleApiClient`.
- Removed callback-style `https.request` blocks and the service-local `_guacamoleApiCall` helper from `GuacamoleService`.
- Kept direct-session URL logging redacted and replaced remaining Guacamole service debug `console.*` calls with logger calls.
- Added `HTTP_ALLOW_INSECURE_TLS` as the shared request-level TLS switch while preserving `PVE_ALLOW_INSECURE_TLS` as fallback.
- Fixed VNC connectivity failure handling so failed port checks return `503` instead of continuing.
- Added `tests/guacamole-api-client.test.ts` for form-urlencoded auth, authenticated request headers, and active-connection PATCH payloads.
- Verified:
  - `npm run typecheck`
  - `npm test` (`5` files, `14` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 OpenAI Client Slice

- Added `src/modules/openai/OpenAIClientFactory.ts` to centralize OpenAI SDK configuration for chat flows.
- Migrated `AIChatService` hint, platform-guide, and VM command classifier calls away from repeated `new OpenAI(...)` construction and direct `process.env.OPENAI_*` reads.
- Added `src/modules/openai/OpenAICompatibleChatClient.ts` for AI Box Build OpenAI-compatible `/chat/completions` calls, including model fallback order, max token config, timeout, auth headers, and non-2xx error normalization.
- Migrated AI Box Build agent execution to use `OpenAICompatibleChatClient` while keeping artifact parsing behavior inside `AIBoxBuildService`.
- Added:
  - `tests/openai-client-factory.test.ts`
  - `tests/openai-compatible-chat-client.test.ts`
- Verified:
  - `npm run typecheck`
  - `npm test` (`7` files, `19` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 OpenCode Runner Slice

- Added `src/modules/opencode/OpenCodeRunner.ts` for child-process execution, timeout killing, stdout/stderr tailing, stdin forwarding, and command-result summaries.
- Migrated AI Box Build preflight, opencode generation, SSH/SCP upload, and remote script execution calls from service-local `_runCommand` / `_summarizeCommandResult` to `OpenCodeRunner`.
- Removed direct `child_process.spawn` ownership from `AIBoxBuildService`.
- Added `tests/opencode-runner.test.ts` for command output capture and timeout summary formatting.
- Verified:
  - `npm run typecheck`
  - `npm test` (`8` files, `21` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 Schema Index Slice

- Added non-unique lookup/list indexes:
  - Users: `email`, `username`, `role`, `course_ids`, `owned_vms`.
  - VMs: `owner`, `{ pve_node, pve_vmid }`, `{ is_box_vm, box_id }`, `fromTemplateId`.
  - VM tasks: `task_id`, `{ user_id, created_at }`, `{ status, updated_at }`.
  - AI box build jobs: `{ requester_user_id, updated_at }`, `{ execution_status, updated_at }`, `{ status, updated_at }`.
- Avoided new unique indexes until duplicate data has been checked and a migration/cleanup path exists.
- Added `tests/schema-indexes.test.ts` to keep expected indexes visible in CI.
- Verified:
  - `npm run typecheck`
  - `npm test` (`9` files, `24` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 AI Box Build Env Slice

- Added typed config entries for AI Box Build Ubuntu baseline and OpenCode runtime settings:
  - blocked nodes, preflight/stale/setup/validation/run timeouts, cloud-init preparation, guest network normalization, IP wait policy, reference size limits, workspace/reference roots, and opencode binary/model.
- Migrated `AIBoxBuildService` and `AIBoxBuildPrompts` away from direct `process.env.OPENAI_*`, `process.env.OPENCODE_*`, and `process.env.PROJECTUSER_*` reads.
- Reused shared `redactSecret` for AI Box Build run-log redaction.
- Confirmed `.env.example` already documents the corresponding AI Box Build/OpenCode variables.
- Verified:
  - `npm run typecheck`
  - `npm test` (`9` files, `24` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 CI Slice

- Added `.github/workflows/backend-ci.yml`.
- CI runs on pull requests and pushes to `main`/`master`.
- CI steps:
  - `npm ci`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm audit --audit-level=moderate`
- Locally re-verified the npm commands used by CI:
  - `npm run typecheck`
  - `npm test` (`9` files, `24` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 Review Policy Slice

- Added `src/modules/reviews/ReviewPolicy.ts` for shared review input validation, comment normalization, and rounded rating-summary calculation.
- Migrated Course review create/update/delete rating recalculation through `ReviewPolicy`.
- Migrated VM Box review create/update/delete rating recalculation through `ReviewPolicy`.
- Tightened VM Box review behavior to match Course review validation:
  - rating must be an integer from 1 to 5;
  - optional comments must be strings and no longer than 1000 characters;
  - reviewer/review IDs are stored and checked consistently as strings.
- Added `tests/review-policy.test.ts`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`10` files, `27` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 Course/VM Box Logging Slice

- Removed ad hoc `console.log` debug output from Course invite/template lookup paths.
- Replaced `console.error` / `console.warn` / remaining approval debug output in `VMBoxService` with the shared logger.
- Removed a test-only answer-record log that exposed box flag answer material.
- Verified no `console.*` calls remain in:
  - `src/service/CourseService.ts`
  - `src/service/VMBoxService.ts`
- Verified:
  - `npm run typecheck`
  - `npm test` (`10` files, `27` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 Review Index Slice

- Added non-unique indexes to `src/orm/schemas/ReviewsSchemas.ts`:
  - `{ reviewer_user_id: 1, submitted_date: -1 }`
  - `{ rating_score: 1 }`
- Extended `tests/schema-indexes.test.ts` to assert review indexes.
- Verified:
  - `npm run typecheck`
  - `npm test` (`10` files, `28` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 VM/PVE Logging Slice

- Replaced service-layer `console.*` calls in `VMService` and `PVEService` with the shared logger.
- Removed verbose VM network and PVE task response dumps from normal logs, replacing them with concise debug messages.
- Verified no `console.*` calls remain in:
  - `src/service/VMService.ts`
  - `src/service/PVEService.ts`
- Verified:
  - `npm run typecheck`
  - `npm test` (`10` files, `28` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 VMManage Logging Slice

- Replaced service-layer `console.*` calls in `VMManageService` with the shared logger.
- Reduced PVE delete response logging to a concise data-type debug message instead of dumping response bodies.
- Verified no `console.*` calls remain in `src/service/VMManageService.ts`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`10` files, `28` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 Template/VM Operation Logging Slice

- Replaced service-layer `console.*` calls in `TemplateManageService` and `VMOperateService` with the shared logger.
- Reduced template deletion logs to resource-reclaim summaries and task success status instead of dumping full PVE config or wait-result objects.
- Verified no `console.*` calls remain in:
  - `src/service/TemplateManageService.ts`
  - `src/service/VMOperateService.ts`
- Verified:
  - `npm run typecheck`
  - `npm test` (`10` files, `28` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-25 Template Service Logging Slice

- Replaced service-layer `console.*` calls in `TemplateService` with the shared logger.
- Removed full user/template/QEMU/clone-result object dumps from template conversion and approval flows.
- Kept template audit and clone observability as concise status logs: source/target VMIDs, sanitized clone name, UPID presence, and verification result.
- Verified no `console.*` calls remain in `src/service/TemplateService.ts`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`10` files, `28` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Remaining Logging Cleanup Slice

- Removed the remaining `console.*` calls from backend service/utils/controller/router paths.
- Updated `VMUtils` PVE task/disk/clone/template-delete logs to use the shared logger and avoid full PVE response, PVE URL, disk config, or QEMU config dumps.
- Updated fetch JSON parse failures, CRP service auth/error paths, chapter error handling, and mail senders to use the shared logger.
- Mail senders now log SMTP `messageId` on success and structured errors on failure instead of dumping full transport responses.
- Verified:
  - `rg -n "console\\.(log|error|warn|debug|info)" src/service src/utils src/controller src/routers` returns no matches.
  - `npm run typecheck`
  - `npm test` (`10` files, `28` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Env Runtime Cleanup Slice

- Added typed config entries for:
  - `server.homePagePath`
  - `server.backendBaseUrl`
  - `security.jwtSecret`
  - `runtime.homeDir`
  - `pve.bootNormalizeGuestNetwork`
  - `pve.bootGuestIdentityTimeoutMs`
- Migrated `PageController`, `fetch` helper, token utilities, VM boot network normalization, mail senders, and AI Box Build workspace/reference roots to use `env`.
- Removed duplicate `dotenv.config()` calls from controllers and mail sender modules.
- Centralized AI Box Build child-process environment expansion behind `_childProcessEnv()`.
- Updated `.env.example` with `BACKEND_BASE_URL`, `VM_BOOT_NORMALIZE_GUEST_NETWORK`, and `VM_BOOT_GUEST_IDENTITY_TIMEOUT_MS`.
- Verified:
  - `rg -n "require\\('dotenv'\\)|dotenv\\.config|process\\.env" src --glob '!src/config/env.ts'` now only reports the intentional AI Box Build child-process environment helper.
  - `npm run typecheck`
  - `npm test` (`10` files, `28` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 CORS Policy Slice

- Added `src/modules/http/CorsPolicy.ts` to make CORS origin decisions testable outside Express wiring.
- Updated `src/app.ts` to use the shared CORS policy with `env.server.corsOrigins`.
- Added `tests/cors-policy.test.ts` covering:
  - requests without an Origin header;
  - wildcard allowlist;
  - exact allowlist match;
  - rejection of unknown origins.
- Verified:
  - `npm run typecheck`
  - `npm test` (`11` files, `32` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Operation Policy Slice

- Added `src/modules/vm/VMOperationPolicy.ts` for VM operation authorization and status precondition decisions.
- Updated `VMOperateService` boot/shutdown/poweroff/reboot/reset paths to use the shared policy while preserving existing frontend-facing response messages.
- Added `tests/vm-operation-policy.test.ts` covering:
  - owner and superadmin authorization;
  - non-owner rejection;
  - boot rejection for already-running VMs;
  - running-state requirements for shutdown, poweroff, reboot, and reset;
  - allowed valid operation states.
- Verified:
  - `npm run typecheck`
  - `npm test` (`12` files, `38` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Operation Input Validation Slice

- Extended `VMOperationPolicy` with `validateVMOperationTargetId()`.
- Updated `VMOperateService` boot/shutdown/poweroff/reboot/reset paths to reject missing or invalid `vm_id` values before Mongoose queries.
- Invalid VM operation IDs now return `400 Invalid VM ID format` instead of falling through to cast errors.
- Added unit coverage for missing, invalid, and valid VM operation target IDs.
- Verified:
  - `npm run typecheck`
  - `npm test` (`12` files, `39` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 ObjectId Input Policy Slice

- Added `src/modules/common/ObjectIdPolicy.ts` for shared ObjectId input validation and normalization.
- Reused it in `VMOperationPolicy`.
- Updated `SuperAdminCRPService` update/delete/get-by-id paths to reject missing or invalid `crpId` before Mongoose queries.
- Added `tests/object-id-policy.test.ts`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`13` files, `42` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Management ID Validation Slice

- Applied `validateObjectIdInput()` to `TemplateManageService` update/delete/clone template flows.
- Invalid `template_id` values now return `400 Invalid template_id format` before Mongoose queries.
- Normalized template IDs are used for lookups, updates, deletes, owned-template removal, clone task IDs, and success payloads.
- Verified:
  - `npm run typecheck`
  - `npm test` (`13` files, `42` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Service ID Validation Slice

- Applied `validateObjectIdInput()` to `TemplateService`:
  - VM-to-template conversion `vm_id`;
  - template submission `template_id`;
  - submitted-template audit `template_id`.
- Invalid IDs now return 400 responses before Mongoose queries.
- Normalized VM IDs are used for VM lookup and owned-VM removal during conversion.
- Verified:
  - `npm run typecheck`
  - `npm test` (`13` files, `42` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 SuperAdmin ID Validation Slice

- Applied `validateObjectIdInput()` to `SuperAdminService`:
  - `changeUserRole` `userId`;
  - `assignCRPToUser` `userId`;
  - `assignCRPToUser` `planId`.
- Invalid admin-managed user/plan IDs now return 400 responses before Mongoose queries.
- Verified:
  - `npm run typecheck`
  - `npm test` (`13` files, `42` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 CRP Payload Policy Slice

- Added `src/modules/crp/ComputeResourcePlanPolicy.ts`.
- `SuperAdminCRPService` create/update now validates CRP payloads before database writes.
- Create CRP validation now requires:
  - non-empty sanitized name;
  - all resource limit fields;
  - positive numeric resource limits;
  - per-VM CPU/memory/storage limits not exceeding total CPU/memory/storage limits.
- Update CRP validation now allows only known CRP fields and rejects empty updates.
- Added `tests/compute-resource-plan-policy.test.ts`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`14` files, `48` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 CRP Index Slice

- Added a safe non-unique `{ name: 1 }` index to `ComputeResourcePlanSchemas`.
- Extended `tests/schema-indexes.test.ts` to assert the CRP name lookup index.
- Kept the index non-unique until existing data can be checked for duplicate plan names and a cleanup path exists.
- Verified:
  - `npm run typecheck`
  - `npm test` (`14` files, `49` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 PVE Query Validation Slice

- Added `src/modules/common/PaginationPolicy.ts` for reusable positive-integer pagination validation.
- Added `tests/pagination-policy.test.ts`.
- Updated `PVEService.getQemuConfig()` to validate query `vm_id` before Mongoose lookups.
- Updated `PVEService.getUserAllTasksStatus()` to validate:
  - `page`;
  - `limit`;
  - optional task `status`.
- Invalid PVE query inputs now return 400 responses instead of producing cast errors or unstable pagination queries.
- Verified:
  - `npm run typecheck`
  - `npm test` (`15` files, `53` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Run Validation Slice

- Added `src/modules/ai-box-build/AIBoxBuildRunPolicy.ts` for tested AI Box Build run request validation.
- Updated `AIBoxBuildService.launchBuildRun()` to use the run policy instead of service-local request parsing.
- Applied `validateObjectIdInput()` to AI Box Build public `job_id` endpoints:
  - get job;
  - delete job;
  - add message;
  - update status;
  - launch run.
- Run validation now covers:
  - `template_id` ObjectId format for non-dry-run requests;
  - blocked target nodes;
  - VM name length;
  - positive CPU/memory/disk values;
  - CI credential requirements for non-dry-run requests;
  - dry-run requests without template credentials.
- Added `tests/ai-box-build-run-policy.test.ts`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`16` files, `58` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Workspace Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildWorkspacePolicy.ts`.
- Extracted AI Box Build workspace/reference path safety decisions from `AIBoxBuildService`.
- `AIBoxBuildService` now uses policy helpers for:
  - deterministic job workspace path construction;
  - reference bundle path containment under the configured reference root;
  - job workspace deletion path matching and containment under the configured workspace root.
- Added `tests/ai-box-build-workspace-policy.test.ts`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`17` files, `64` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Run Log Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildRunLogPolicy.ts`.
- Extracted AI Box Build run-log redaction and tailing from `AIBoxBuildService`.
- `AIBoxBuildService` now delegates run log construction to `makeAIBoxRunLog()`.
- Added `tests/ai-box-build-run-log-policy.test.ts` covering:
  - configured secret redaction;
  - password-like key redaction through shared redaction;
  - long-message tailing.
- Verified:
  - `npm run typecheck`
  - `npm test` (`18` files, `66` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Direct URL Slice

- Added `src/modules/guacamole/GuacamoleDirectUrl.ts`.
- Extracted Guacamole connection ID Base64URL encoding and direct URL construction from `GuacamoleService`.
- Direct URL token query values are now URL-encoded.
- Added `tests/guacamole-direct-url.test.ts` covering connection ID encoding and token escaping.
- Verified:
  - `npm run typecheck`
  - `npm test` (`19` files, `68` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Profile Slice

- Added `src/modules/guacamole/ConnectionProfileFactory.ts`.
- Extracted SSH/RDP/VNC Guacamole connection profile construction from `GuacamoleService`.
- `GuacamoleService` now delegates protocol-specific connection names, parameters, and attributes to the factory.
- Added `tests/connection-profile-factory.test.ts` covering:
  - SSH root fallback, font size, and connection limit attributes;
  - RDP security/certificate/clipboard settings;
  - VNC UTF-8 clipboard and color-depth settings.
- Verified:
  - `npm run typecheck`
  - `npm test` (`20` files, `71` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Terminal Font Policy Slice

- Extended `src/modules/guacamole/ConnectionProfileFactory.ts`.
- Extended `tests/connection-profile-factory.test.ts`.
- Extracted Guacamole SSH terminal font-size normalization from `GuacamoleService` into the connection profile factory.
- Font size defaulting, numeric parsing, rounding, and 10-24 bounds are now tested directly.
- SSH profile construction now normalizes font size before emitting the connection name and `"font-size"` parameter.
- Verified:
  - `npm run typecheck`
  - `npm test` (`55` files, `228` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Management ID Validation Slice

- Applied `validateObjectIdInput()` to `VMManageService` high-risk public workflows:
  - create VM from template `template_id`;
  - delete VM `vm_id`;
  - update VM config `vm_id`;
  - create VM from box template `box_id`.
- Normalized IDs are used for DB lookups, task creation, VM ownership checks, DB cleanup, and response payloads.
- Invalid IDs now return 400 responses before Mongoose queries.
- Verified:
  - `npm run typecheck`
  - `npm test` (`20` files, `71` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Cloud-Init Policy Slice

- Added `src/modules/vm/VMCloudInitPolicy.ts`.
- Added `tests/vm-cloud-init-policy.test.ts`.
- Extracted VM Cloud-Init credential rules from `VMManageService`:
  - template `ciuser`/`cipassword` validity checks;
  - request-provided credential override behavior for VM creation;
  - update-time requirement that `ciuser` and `cipassword` are provided together and non-empty.
- `createVMFromTemplate()` now delegates credential selection to the tested policy before VM configuration.
- `updateVMConfig()` now delegates Cloud-Init update validation to the tested policy before ownership/resource checks.
- Verified:
  - `npm run typecheck`
  - `npm test` (`56` files, `236` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Task Factory Slice

- Added `src/modules/vm/VMTaskFactory.ts`.
- Added `tests/vm-task-factory.test.ts`.
- Extracted VM task initialization rules from `VMManageService`:
  - clone task ID generation and initial VM creation step order;
  - update task ID generation and initial VM update step order;
  - shared pending step defaults and exported step index constants.
- `VMManageService` now delegates create/update task object assembly to the tested factory and reuses the exported step indices in workflow progression.
- Verified:
  - `npm run typecheck`
  - `npm test` (`57` files, `239` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Task Progression Payload Slice

- Extended `src/modules/vm/VMTaskFactory.ts`.
- Extended `tests/vm-task-factory.test.ts`.
- Extracted VM task status and step update payload rules from `VMManageService`:
  - top-level task `status`, `updated_at`, optional `upid`, and optional `error_message` updates;
  - dynamic `steps.<index>` update keys for step status, end time, optional UPID, and optional error messages.
- `VMManageService._updateTaskStatus()` and `_updateTaskStep()` now delegate Mongo update payload assembly to the tested factory.
- Verified:
  - `npm run typecheck`
  - `npm test` (`57` files, `241` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Deletion Policy Slice

- Added `src/modules/vm/VMDeletionPolicy.ts`.
- Added `tests/vm-deletion-policy.test.ts`.
- Extracted PVE VM deletion response classification from `VMManageService`:
  - UPID string responses are classified as async deletion tasks;
  - `data: null` responses are classified as immediate success;
  - missing, empty, or unexpected response data types return stable user-safe error messages.
- `VMManageService._processDeletionResponse()` now delegates response classification to the tested policy and keeps only the PVE task wait orchestration.
- Verified:
  - `npm run typecheck`
  - `npm test` (`58` files, `245` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Config Update Policy Slice

- Added `src/modules/vm/VMConfigUpdatePolicy.ts`.
- Added `tests/vm-config-update-policy.test.ts`.
- Extracted VM config update request/resource rules from `VMManageService`:
  - at-least-one-field validation for config updates;
  - VM name type validation and sanitized output;
  - reuse of Cloud-Init pair validation;
  - current/new CPU, memory, disk, and delta calculation;
  - execution-plan branching for name, CPU, memory, disk resize, Cloud-Init, and unsupported disk reduction.
- `VMManageService.updateVMConfig()` now delegates request validation and resource delta calculation to the tested policy before DB/PVE orchestration.
- `VMManageService._updateVMConfiguration()` now delegates branch decisions to the tested execution plan and keeps only PVE operation orchestration.
- Verified:
  - `npm run typecheck`
  - `npm test` (`59` files, `252` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Auth Token ID Validation Slice

- Added `src/modules/auth/AuthTokenPolicy.ts`.
- Added `tests/auth-token-policy.test.ts`.
- `validateTokenAndGetUser()` and `validateTokenAndGetUserWithPermission()` now validate token `_id` payloads before calling `UsersModel.findById()`.
- Malformed token user IDs now return `401 invalid token` instead of surfacing Mongoose cast errors.
- Verified:
  - `npm run typecheck`
  - `npm test` (`21` files, `73` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Read ID Validation Slice

- Reused `validateVMOperationTargetId()` in `VMService`.
- `getVMStatus()` and `getVMNetworkInfo()` now validate and normalize `vm_id` query values before `VMModel.findOne()`.
- Invalid VM IDs now return 400 responses before Mongoose query/cast work.
- Verified:
  - `npm run typecheck`
  - `npm test` (`21` files, `73` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Target Validation Slice

- Added `src/modules/guacamole/GuacamoleConnectionRequestPolicy.ts`.
- Added `tests/guacamole-connection-request-policy.test.ts`.
- SSH/RDP/VNC connection creation now validates and normalizes:
  - `vm_id` before VM permission lookup;
  - connection `port` before socket connectivity checks and Guacamole profile construction.
- Disconnect and delete workflows now validate local/Guacamole connection identifiers before passing them to Guacamole API calls.
- Protocol default ports are centralized for SSH, RDP, and VNC connection requests.
- Verified:
  - `npm run typecheck`
  - `npm test` (`22` files, `79` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat Request Validation Slice

- Added `src/modules/ai-chat/AIChatRequestPolicy.ts`.
- Added `tests/ai-chat-request-policy.test.ts`.
- Box hint streaming and non-streaming flows now validate and normalize `vm_id` before VM lookup.
- AI VM management now validates `user_input` length/emptiness and optional `current_vm_id` before classifier prompts and target resolution.
- Platform guide streaming and non-streaming flows now reuse the same AI chat input policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`23` files, `84` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Answer Validation Slice

- Added `src/modules/vm-box/VMBoxAnswerPolicy.ts`.
- Added `tests/vm-box-answer-policy.test.ts`.
- `getMyAnswerRecord()` now validates and normalizes `vm_id` before VM lookup.
- `submitBoxAnswer()` now validates:
  - `vm_id` before VM lookup;
  - `flag_id` before using it as a dynamic answer-record field;
  - `flag_answer` as a string while preserving exact answer text for comparison.
- Verified:
  - `npm run typecheck`
  - `npm test` (`24` files, `89` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Answer Evaluation Policy Slice

- Extended `src/modules/vm-box/VMBoxAnswerPolicy.ts`.
- Extended `tests/vm-box-answer-policy.test.ts`.
- Extracted VM Box answer status and flag answer evaluation rules from `VMBoxService`:
  - answer record status projection only includes configured flags;
  - non-string or missing flag answers are ignored through the shared normalization rule;
  - flag answer checks now return explicit valid-flag and correctness decisions.
- `VMBoxService.getMyAnswerRecord()` and `submitBoxAnswer()` now keep persistence/write orchestration while answer status/evaluation rules live in the tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`55` files, `230` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 User Lookup Permission and ID Validation Slice

- Added `src/modules/users/UserLookupPolicy.ts`.
- Added `tests/user-lookup-policy.test.ts`.
- `UserService.getUserById()` now validates target user IDs before `UsersModel.findById()`.
- `getUserById()` now uses `validateTokenAndGetSuperAdminUser()` to match its documented SuperAdmin-only behavior.
- Verified:
  - `npm run typecheck`
  - `npm test` (`25` files, `91` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 SuperAdmin User Mutation Policy Slice

- Added `src/modules/super-admin/SuperAdminUserMutationPolicy.ts`.
- Added `tests/super-admin-user-mutation-policy.test.ts`.
- `SuperAdminService.changeUserRole()` and `assignCRPToUser()` now use `validateTokenAndGetSuperAdminUser()` consistently with other SuperAdmin workflows.
- Assignable user roles are centralized and tested; only `user` and `admin` can be assigned.
- Verified:
  - `npm run typecheck`
  - `npm test` (`26` files, `93` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat Language Policy Slice

- Added `src/modules/ai-chat/AIChatLanguagePolicy.ts`.
- Added `tests/ai-chat-language-policy.test.ts`.
- Extracted AI Chat response-language detection, language-name mapping, language-control prompt construction, and localized response helpers from `AIChatService`.
- `AIChatService` now reuses the tested language policy for:
  - Box hint prompts;
  - platform guide prompts;
  - AI VM management target resolution and localized action/result messages.
- Verified:
  - `npm run typecheck`
  - `npm test` (`27` files, `97` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat VM Intent Policy Slice

- Added `src/modules/ai-chat/AIChatVMIntentPolicy.ts`.
- Added `tests/ai-chat-vm-intent-policy.test.ts`.
- Extracted deterministic VM management fallback parsing and classifier intent alias normalization from `AIChatService`.
- `AIChatService` now uses the tested policy when model classification fails or produces a low-confidence `help` intent while the deterministic parser recognizes a VM action.
- Verified:
  - `npm run typecheck`
  - `npm test` (`28` files, `101` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Delete Permission Policy Slice

- Added `src/modules/guacamole/GuacamoleConnectionPermissionPolicy.ts`.
- Added `tests/guacamole-connection-permission-policy.test.ts`.
- Extracted Guacamole connection delete ownership checks from `GuacamoleService`.
- Non-SuperAdmin deletion now uses a tested rule requiring connection names to end with the requesting user's email.
- Verified:
  - `npm run typecheck`
  - `npm test` (`29` files, `105` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Writeup Policy Slice

- Added `src/modules/vm-box/VMBoxWriteupPolicy.ts`.
- Added `tests/vm-box-writeup-policy.test.ts`.
- Extracted VM Box writeup validation for:
  - box id, title, and Markdown content submission;
  - admin review status, reject reason, and public flag;
  - approved writeup visibility updates.
- `VMBoxService` now uses normalized writeup/box IDs and sanitized writeup fields from the policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`30` files, `110` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Status Policy Slice

- Added `src/modules/courses/CourseStatusPolicy.ts`.
- Added `tests/course-status-policy.test.ts`.
- Extracted course review/visibility status rules from `CourseService`.
- Course approval and rejection now share the same `審核中` precondition policy.
- Course publish/unpublish requests now validate allowed target statuses and prevent publishing before approval has moved the course to `未公開`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`31` files, `113` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Submission Audit Policy Slice

- Added `src/modules/vm-box/VMBoxSubmissionAuditPolicy.ts`.
- Added `tests/vm-box-submission-audit-policy.test.ts`.
- Extracted VM Box submission audit validation for `submission_id`, approval/rejection status, and reject reason sanitization.
- `VMBoxService.auditBoxSubmission()` now uses normalized submission IDs and sanitized reject reasons from the policy.
- Fixed the missing-field validation message to refer to `submission_id` instead of `box_id`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`32` files, `117` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Submission Audit Policy Slice

- Added `src/modules/templates/TemplateSubmissionAuditPolicy.ts`.
- Added `tests/template-submission-audit-policy.test.ts`.
- Extracted submitted-template audit validation for submitted template ID, approval/rejection status, and reject reason sanitization.
- `TemplateService.auditSubmittedTemplate()` now uses normalized submitted-template IDs and sanitized reject reasons from the policy.
- Rejection emails now use the same sanitized/default reject reason that is persisted to the submitted template.
- Verified:
  - `npm run typecheck`
  - `npm test` (`33` files, `121` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole VM Network Policy Slice

- Added `src/modules/guacamole/GuacamoleVMNetworkPolicy.ts`.
- Added `tests/guacamole-vm-network-policy.test.ts`.
- Extracted guest-agent interface IPv4 extraction and Guacamole target IP selection from `GuacamoleService`.
- The tested policy preserves:
  - loopback/IPv6 filtering;
  - requested IP validation against VM-reported IPs;
  - private IP preference for automatic selection.
- Verified:
  - `npm run typecheck`
  - `npm test` (`34` files, `126` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Content Policy Slice

- Added `src/modules/courses/CourseContentPolicy.ts`.
- Added `tests/course-content-policy.test.ts`.
- Extracted Course create/update content validation from `CourseService`.
- `CourseService.AddCourse()` and `UpdateCourseById()` now share tested rules for:
  - required create fields;
  - title/subtitle/description sanitization and non-empty checks;
  - positive duration;
  - allowed difficulty values;
  - empty update rejection.
- Preserved existing API error message differences and existing sanitize-without-trim persistence behavior.
- Verified:
  - `npm run typecheck`
  - `npm test` (`35` files, `131` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Class Content Policy Slice

- Added `src/modules/courses/ClassContentPolicy.ts`.
- Added `tests/class-content-policy.test.ts`.
- Extracted Class create/update validation from `ClassService`.
- `ClassService.AddClassToCourse()` and `UpdateClassById()` now share tested rules for:
  - required create fields;
  - name/subtitle sanitization and non-empty checks;
  - non-negative class order;
  - empty update rejection.
- Duplicate class-name checks now use the sanitized class name that will actually be persisted.
- Verified:
  - `npm run typecheck`
  - `npm test` (`36` files, `136` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Chapter Content Policy Slice

- Added `src/modules/courses/ChapterContentPolicy.ts`.
- Added `tests/chapter-content-policy.test.ts`.
- Extracted Chapter create/update validation from `ChapterService`.
- `ChapterService.AddChapterToClass()` and `UpdateChapterById()` now share tested rules for:
  - required create fields;
  - name/subtitle/content sanitization and create-time non-empty checks;
  - update-time content mapping to `waiting_for_approve_content`;
  - non-negative chapter order;
  - empty update rejection.
- Duplicate chapter-name checks now use the sanitized chapter name that will actually be persisted.
- Updating a chapter with its current order no longer self-collides during duplicate order checks.
- Verified:
  - `npm run typecheck`
  - `npm test` (`37` files, `142` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Access Policy Slice

- Added `src/modules/courses/CourseAccessPolicy.ts`.
- Added `tests/course-access-policy.test.ts`.
- Extracted Course membership/access rules from `CourseService`.
- `CourseService` now uses tested rules for:
  - joined-course access checks;
  - public-course join eligibility and duplicate join prevention;
  - course review permission;
  - course review visibility;
  - first-template access.
- Joining a course now writes a normalized de-duplicated `course_ids` array.
- `getFirstTemplateByCourseID()` no longer repeats token validation and now allows course owners/SuperAdmin through the tested access policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`38` files, `148` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Submission Policy Slice

- Added `src/modules/courses/CourseSubmissionPolicy.ts`.
- Added `tests/course-submission-policy.test.ts`.
- Extracted Course submission readiness checks from `CourseService.submitCourse()`.
- `submitCourse()` now uses tested rules for:
  - requiring at least one class ID before querying classes;
  - requiring class documents to exist for submission;
  - requiring at least one chapter across the submitted course classes.
- Verified:
  - `npm run typecheck`
  - `npm test` (`39` files, `152` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Invite Policy Slice

- Added `src/modules/courses/CourseInvitePolicy.ts`.
- Added `tests/course-invite-policy.test.ts`.
- Extracted Course invitation request validation from `CourseService.InviteToJoinCourse()`.
- Invite requests now validate `course_id` format and normalize/de-duplicate invite email strings before user lookup.
- `InviteToJoinCourse()` now enforces that only the course owner can invite users to that course.
- Existing users already joined to the course are checked with normalized course IDs before sending mail.
- Verified:
  - `npm run typecheck`
  - `npm test` (`40` files, `155` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box AI Assistant Policy Slice

- Added `src/modules/vm-box/VMBoxAiAssistantPolicy.ts`.
- Added `tests/vm-box-ai-assistant-policy.test.ts`.
- Extracted VM Box student AI assistant setting validation and owner/SuperAdmin permission rules from `VMBoxService.updateBoxAiAssistantSetting()`.
- The update flow now validates `box_id` / `submission_id` format before Mongoose lookups, returning `400` instead of falling through to cast errors.
- Preserved existing `box_id` precedence when both `box_id` and `submission_id` are provided.
- Verified:
  - `npm run typecheck`
  - `npm test` (`41` files, `160` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Submission Create Policy Slice

- Added `src/modules/vm-box/VMBoxSubmissionCreatePolicy.ts`.
- Added `tests/vm-box-submission-create-policy.test.ts`.
- Extracted submitted VM Box creation request validation from `VMBoxService.submitBox()`.
- The submission flow now validates `vmtemplate_id` format, sanitizes submitted description/Markdown fields, normalizes `flag_answers`, and preserves the existing `allow_ai_assistant !== false` default behavior.
- `submitBox()` now verifies the referenced VM template exists before creating the submitted-box record.
- The existing `_normalizeFlagAnswers()` helper now delegates to the tested shared normalization policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`42` files, `164` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Review Request Policy Slice

- Added `src/modules/vm-box/VMBoxReviewRequestPolicy.ts`.
- Added `tests/vm-box-review-request-policy.test.ts`.
- Extracted VM Box review request validation for create, list, update, and delete flows.
- `VMBoxService.rateBox()` and `getBoxReviews()` now validate `box_id` format before Mongoose lookups, returning user-safe `400` responses for malformed IDs.
- Review update/delete flows now share the same tested `review_id` and `box_id` validation messages.
- Verified:
  - `npm run typecheck`
  - `npm test` (`43` files, `169` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Listing DTO Factory Slice

- Added `src/modules/vm-box/VMBoxListDTOFactory.ts`.
- Added `tests/vm-box-list-dto-factory.test.ts`.
- Extracted submitted/public/pending VM Box listing DTO assembly from `VMBoxService`.
- Listing flows now share tested rules for:
  - fallback template info;
  - submitted and published box ID projection;
  - AI assistant default handling;
  - flag answer normalization and public flag count;
  - submitter info attachment.
- `VMBoxService` now keeps DB/PVE lookup orchestration while the response shape is owned by pure DTO factory functions.
- Verified:
  - `npm run typecheck`
  - `npm test` (`44` files, `173` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Writeup Query Policy Slice

- Extended `src/modules/vm-box/VMBoxWriteupPolicy.ts`.
- Extended `tests/vm-box-writeup-policy.test.ts`.
- Extracted VM Box writeup query validation for:
  - public writeup lookup by `box_id`;
  - current-user writeup optional `box_id` filter;
  - admin writeup submission filters by `box_id` and writeup status.
- `VMBoxService` no longer performs ad hoc ObjectId/status checks in these writeup query paths.
- Removed the now-unused `mongoose.Types` import from `VMBoxService`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`44` files, `176` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Writeup DTO Factory Slice

- Added `src/modules/vm-box/VMBoxWriteupDTOFactory.ts`.
- Added `tests/vm-box-writeup-dto-factory.test.ts`.
- Extracted VM Box writeup DTO assembly from `VMBoxService._toWriteupDTO()`.
- Writeup DTO rules are now tested for:
  - public-safe author/reviewer fields;
  - private reviewer metadata;
  - owner-visible reject reasons;
  - fallback author avatar/name;
  - box/template display metadata.
- `VMBoxService._toWriteupDTO()` now handles DB lookup and permission booleans, then delegates response-shape assembly to the DTO factory.
- Verified:
  - `npm run typecheck`
  - `npm test` (`45` files, `179` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Permission Policy Slice

- Added `src/modules/vm-box/VMBoxPermissionPolicy.ts`.
- Added `tests/vm-box-permission-policy.test.ts`.
- Extracted VM Box moderation and writeup owner-modification rules from `VMBoxService`.
- `VMBoxService._canModerateBox()` and `_toWriteupDTO()` now delegate role/ownership checks to tested policy functions.
- Verified:
  - `npm run typecheck`
  - `npm test` (`46` files, `183` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Job Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildJobPolicy.ts`.
- Added `tests/ai-box-build-job-policy.test.ts`.
- Extracted AI Box Build job request/access rules from `AIBoxBuildService`:
  - initial direction and constraints validation;
  - follow-up message validation;
  - status update validation;
  - SuperAdmin/requester job access checks.
- `AIBoxBuildService.createJob()`, `addMessage()`, and `updateStatus()` now use normalized policy values instead of ad hoc request validation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`47` files, `188` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Artifact Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildArtifactPolicy.ts`.
- Added `tests/ai-box-build-artifact-policy.test.ts`.
- Extracted AI Box Build artifact normalization helpers from `AIBoxBuildService`:
  - phase/string/string-array normalization;
  - artifact fallback normalization;
  - required artifact usability checks;
  - usable artifact and unresolved placeholder checks;
  - raw artifact coercion;
  - validation finding merge helpers;
  - default validation report creation.
- `AIBoxBuildService` now delegates these helper rules to the tested artifact policy and directly uses the shared required-artifact usability check in split generation paths.
- Verified:
  - `npm run typecheck`
  - `npm test` (`59` files, `256` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Agent Response Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildAgentResponsePolicy.ts`.
- Added `tests/ai-box-build-agent-response-policy.test.ts`.
- Extracted AI Box Build agent response parsing from `AIBoxBuildService`:
  - string chat-completion normalization;
  - fenced JSON and embedded JSON parsing;
  - top-level artifact field coercion into `artifacts`;
  - non-JSON fallback draft artifact creation;
  - AI generation failure draft creation;
  - public AI error redaction/truncation;
  - review-safe agent history JSON serialization.
- `AIBoxBuildService` now delegates parsing, failure fallback, public error redaction, and history serialization to the tested policy functions.
- Verified:
  - `npm run typecheck`
  - `npm test` (`59` files, `255` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Validation Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildValidationPolicy.ts`.
- Added `tests/ai-box-build-validation-policy.test.ts`.
- Extracted AI Box Build artifact validation/report generation from `AIBoxBuildService`:
  - artifact presence, length, and placeholder checks;
  - design/setup/writeup review-grade content checks;
  - AI assistant design wording warnings;
  - required reference extraction and preservation checks;
  - Ubuntu baseline preservation checks;
  - setup command detection.
- `AIBoxBuildService` now delegates validation report creation to the tested policy and no longer owns the internal validation helper stack.
- Verified:
  - `npm run typecheck`
  - `npm test` (`50` files, `204` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build DTO Factory Slice

- Added `src/modules/ai-box-build/AIBoxBuildDTOFactory.ts`.
- Added `tests/ai-box-build-dto-factory.test.ts`.
- Extracted AI Box Build job DTO projection from `AIBoxBuildService._toDTO()`.
- DTO assembly now has tested defaults for artifacts, validation reports, message arrays, execution status, provisioning data, and run logs.
- `AIBoxBuildService._toDTO()` now delegates to the tested DTO factory.
- Verified:
  - `npm run typecheck`
  - `npm test` (`51` files, `206` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Markdown Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildMarkdownPolicy.ts`.
- Added `tests/ai-box-build-markdown-policy.test.ts`.
- Extracted AI Box Build Markdown completion rules from `AIBoxBuildService`:
  - resolving requested Ubuntu baseline from direction/constraints;
  - appending Platform Baseline sections when generated artifacts omit the requested Ubuntu version;
  - mirroring generated setup scripts into `setup.md` when Markdown lacks concrete commands.
- `AIBoxBuildService` now delegates Markdown/baseline helpers to the tested policy while preserving environment-driven latest Ubuntu configuration.
- Verified:
  - `npm run typecheck`
  - `npm test` (`52` files, `212` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Reference Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildReferencePolicy.ts`.
- Added `tests/ai-box-build-reference-policy.test.ts`.
- Extracted AI Box Build reference bundle rules from `AIBoxBuildService`:
  - English and Traditional Chinese reference bundle path marker parsing;
  - safe workspace folder name normalization;
  - ignored reference entry names for dependency/generated folders.
- Reference bundle staging and directory summarization now share the same tested ignore policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`53` files, `217` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build OpenCode Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildOpenCodePolicy.ts`.
- Added `tests/ai-box-build-opencode-policy.test.ts`.
- Extracted AI Box Build OpenCode model/config rules from `AIBoxBuildService`:
  - provider prefix normalization for `opencode run`;
  - provider-qualified model ID normalization for `opencode.json`;
  - OpenAI-compatible provider config JSON assembly.
- `AIBoxBuildService` now keeps environment selection locally and delegates OpenCode-specific shape rules to the tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`54` files, `221` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Repair Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildRepairPolicy.ts`.
- Added `tests/ai-box-build-repair-policy.test.ts`.
- Extracted AI Box Build targeted artifact repair decisions from `AIBoxBuildService`:
  - deciding when follow-up feedback should use targeted artifact repair;
  - selecting named or missing artifact targets in deterministic order;
  - falling back to all artifacts for generic artifact repair requests.
- `AIBoxBuildService` now normalizes artifacts locally and delegates repair target rules to the tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`55` files, `226` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Stale Job Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildStaleJobPolicy.ts`.
- Added `tests/ai-box-build-stale-job-policy.test.ts`.
- Extracted AI Box Build stale execution rules from `AIBoxBuildService`:
  - latest valid run-log activity timestamp selection;
  - fallback to job `updated_at` when no valid run log exists;
  - stale job ID selection while skipping in-process jobs;
  - stale-run message generation based on configured timeout minutes.
- `AIBoxBuildService._markStaleExecutionJobs()` now keeps Mongo query/update orchestration while the interruption/staleness rules live in the tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`60` files, `260` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Runtime Preflight Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildRuntimePreflightPolicy.ts`.
- Added `tests/ai-box-build-runtime-preflight-policy.test.ts`.
- Extracted AI Box Build runtime preflight rules from `AIBoxBuildService`:
  - OpenAI-compatible API key/base URL configuration checks;
  - dry-run decision for skipping `sshpass` probing;
  - opencode and sshpass command failure message construction;
  - aggregate runtime preflight failure message construction.
- `AIBoxBuildService._validateRuntimePreflight()` now keeps command execution/probing while the runtime configuration and error message rules live in the tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`61` files, `264` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Lifecycle Policy Slice

- Added `src/modules/guacamole/GuacamoleConnectionLifecyclePolicy.ts`.
- Added `tests/guacamole-connection-lifecycle-policy.test.ts`.
- Extracted Guacamole SSH/RDP/VNC connection lifecycle rules from `GuacamoleService`:
  - same-name connection lookup from existing Guacamole connections;
  - connection create response classification for success, internal error, not found, and missing identifier cases.
- `GuacamoleService` now keeps protocol-specific orchestration and user-facing error wording while delegating shared lifecycle decisions to tested policy helpers.
- Verified:
  - `npm run typecheck`
  - `npm test` (`62` files, `269` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat VM Response Policy Slice

- Added `src/modules/ai-chat/AIChatVMResponsePolicy.ts`.
- Added `tests/ai-chat-vm-response-policy.test.ts`.
- Extracted AI VM management target and response rules from `AIChatService`:
  - explicit/current/compact/fuzzy VM target resolution;
  - localized ambiguous/missing target messages;
  - VM label, uptime, inventory, confirmation, status, network, mutation success, and failure response formatting;
  - localized help reason handling for unsupported VM requests.
- `AIChatService` now keeps token validation, inventory loading, classifier calls, pending-action storage, and VM operation orchestration while VM management wording and target matching live in the tested policy.
- `AIChatService.ts` is now about `718` lines after moving the VM response helpers out of the service.
- Verified:
  - `npm run typecheck`
  - `npm test` (`63` files, `275` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Split Repair Aggregate Slice

- Extended `src/modules/ai-box-build/AIBoxBuildAgentResponsePolicy.ts`.
- Extended `tests/ai-box-build-agent-response-policy.test.ts`.
- Extracted split artifact repair response aggregation from `AIBoxBuildService`:
  - first non-empty repair summary selection;
  - de-duplicated current understanding, open questions, risks, and next actions;
  - verification-phase response creation with repaired artifacts;
  - fallback summary when repair partials do not provide one.
- `AIBoxBuildService._runArtifactRepairAgent()` now owns model orchestration and artifact usability checks while final split-repair response assembly lives in the tested agent response policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`63` files, `277` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Wrapper Cleanup Slice

- Simplified `src/service/AIBoxBuildService.ts`.
- Removed pass-through private wrappers for already-tested AI Box Build policy/factory functions:
  - artifact normalization;
  - phase/string/string-array normalization;
  - validation list merge helpers;
  - DTO assembly;
  - job access checks.
- `AIBoxBuildService` now calls the tested policy/factory functions directly and keeps only the env-aware `_validateBuildArtifacts()` wrapper.
- `AIBoxBuildService.ts` is now about `1451` lines after the cleanup.
- Verified:
  - `npm run typecheck`
  - `npm test` (`63` files, `277` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Creation Cleanup Policy Slice

- Added `src/modules/vm/VMCreationCleanupPolicy.ts`.
- Added `tests/vm-creation-cleanup-policy.test.ts`.
- Extracted VM creation cleanup and retention rules from `VMManageService`:
  - orphan cloud-init disk volume identifier construction;
  - missing-volume error classification for idempotent pre-clone cleanup;
  - old VM task ID selection beyond the newest retention window.
- `VMManageService._cleanupOrphanCloudInitDisk()` and `_cleanupUserOldTasks()` now keep PVE/DB orchestration while pure cleanup decisions live in the tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`64` files, `282` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Answer Access Policy Slice

- Extended `src/modules/vm-box/VMBoxAnswerPolicy.ts`.
- Extended `tests/vm-box-answer-policy.test.ts`.
- Extracted VM Box answer VM access checks from `VMBoxService`:
  - owner-only VM answer access;
  - preserving the existing owner `403` before box-VM `400` check order;
  - normalized box ID return for answer-record and answer-submission box lookup.
- `VMBoxService.getMyAnswerRecord()` and `submitBoxAnswer()` now delegate the repeated VM owner/box validation to the tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`64` files, `285` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course List DTO Factory Slice

- Added `src/modules/courses/CourseListDTOFactory.ts`.
- Added `tests/course-list-dto-factory.test.ts`.
- Extracted repeated CourseInfo DTO assembly from `CourseService`.
- Optimized course list endpoints by collecting unique submitter IDs and loading submitters in one batched query instead of one lookup per course:
  - `GetAllPublicCourses()`;
  - `getAllCourses()`;
  - `getAllSubmittedCourses()`.
- The factory now reports courses with missing submitters so the service can preserve existing warning logs while returning only displayable course DTOs.
- `CourseService.ts` is now about `1038` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`65` files, `289` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box List Submitter Lookup Slice

- Extended `src/modules/vm-box/VMBoxListDTOFactory.ts`.
- Extended `tests/vm-box-list-dto-factory.test.ts`.
- Added tested helpers for:
  - collecting unique VM Box submitter user IDs;
  - building submitter info maps from batched user lookup results;
  - resolving submitter info for DTO assembly.
- Optimized VM Box listing endpoints by loading submitters in one batched query per list instead of one lookup per item:
  - `getSubmittedBoxes()`;
  - `getPublicBoxes()`;
  - `getPendingBoxes()`.
- `VMBoxService.ts` is now about `1169` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`65` files, `291` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Shared Review DTO Factory Slice

- Added `src/modules/reviews/ReviewDTOFactory.ts`.
- Added `tests/review-dto-factory.test.ts`.
- Extracted shared Course/VM Box review DTO assembly:
  - reviewer ID collection for batched user lookup;
  - reviewer info map creation with default-avatar fallback;
  - `can_modify` calculation;
  - unknown-reviewer fallback;
  - newest-first review sorting.
- Optimized review list endpoints by loading reviewers in one batched query per list instead of one lookup per review:
  - `CourseService.getCourseReviews()`;
  - `VMBoxService.getBoxReviews()`.
- `CourseService.ts` is now about `1023` lines and `VMBoxService.ts` is now about `1151` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`66` files, `295` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Disk Readiness Policy Slice

- Added `src/modules/vm/VMDiskReadinessPolicy.ts`.
- Added `tests/vm-disk-readiness-policy.test.ts`.
- Extracted VM disk readiness classification from `VMManageService._waitForVMDiskReady()`:
  - supported `raw`, `qcow2`, and `vmdk` disk formats;
  - clone/import in-progress detection;
  - missing `scsi0` config handling;
  - unclear finished-looking disk format handling.
- `VMManageService._waitForVMDiskReady()` now keeps PVE polling, logging, and retry timing while disk state classification lives in a tested policy.
- `VMManageService.ts` is now about `1348` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`67` files, `299` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build OpenCode Prompt Policy Slice

- Extended `src/modules/ai-box-build/AIBoxBuildOpenCodePolicy.ts`.
- Extended `tests/ai-box-build-opencode-policy.test.ts`.
- Extracted AI Box Build OpenCode prompt rules from `AIBoxBuildService`:
  - workspace `AGENTS.md` safety and artifact-generation instructions;
  - `opencode run` prompt VM context;
  - dry-run target fallback text;
  - latest Ubuntu baseline wording;
  - required output files and validation script requirements.
- `AIBoxBuildService._runOpencodeGenerator()` now keeps command execution and run-log orchestration while prompt construction lives in the tested OpenCode policy.
- `AIBoxBuildService.ts` is now about `1409` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`67` files, `302` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Reference Fallback Policy Slice

- Extended `src/modules/ai-box-build/AIBoxBuildReferencePolicy.ts`.
- Extended `tests/ai-box-build-reference-policy.test.ts`.
- Extracted reference-backed fallback text rules from `AIBoxBuildService`:
  - draft `TODO` marker replacement;
  - generated flag placeholder replacement;
  - `.htb` host normalization to `.ethci`;
  - hard-coded reference IP replacement with `target VM IP`.
- `AIBoxBuildService._writeReferenceFallbackFiles()` now keeps fallback asset I/O and orchestration while reference fallback sanitization lives in tested policy helpers.
- `AIBoxBuildService.ts` is now about `1404` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`67` files, `305` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection List DTO Slice

- Added `src/modules/guacamole/GuacamoleConnectionListDTOFactory.ts`.
- Added `tests/guacamole-connection-list-dto-factory.test.ts`.
- Extracted Guacamole user connection list projection from `GuacamoleService.listUserConnections()`:
  - invalid or missing Guacamole list payload handling;
  - user-email based connection filtering matching the existing naming convention;
  - sparse connection parameter DTO shaping.
- Removed the unused direct-session URL generation from the list path, reducing token-bearing URL handling while preserving the returned API shape.
- `GuacamoleService.ts` is now about `1168` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`68` files, `308` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Established Connection DTO Slice

- Added `src/modules/guacamole/GuacamoleConnectionDTOFactory.ts`.
- Added `tests/guacamole-connection-dto-factory.test.ts`.
- Extracted the shared SSH/RDP/VNC established connection response assembly from `GuacamoleService`:
  - stable `connection_id` construction from protocol, VM ID, and timestamp;
  - active status and creation/expiration timestamps;
  - target IP, available IPs, direct URL, Guacamole token/source/config ID fields.
- SSH/RDP/VNC creation flows now keep lifecycle orchestration while the returned DTO shape lives in one tested factory.
- `GuacamoleService.ts` is now about `1153` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`69` files, `310` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Invite Batch Lookup Slice

- Extended `src/modules/courses/CourseInvitePolicy.ts`.
- Extended `tests/course-invite-policy.test.ts`.
- Added tested recipient selection for Course invites:
  - preserves normalized requested email order;
  - skips users that do not exist;
  - skips users already joined to the course.
- Optimized `CourseService.InviteToJoinCourse()` from one `UsersModel.findOne({ email })` per requested email to one batched `UsersModel.find({ email: { $in: ... } })` lookup.
- Kept mail sending sequential to preserve conservative sender behavior.
- `CourseService.ts` is now about `1018` lines after the optimization.
- Verified:
  - `npm run typecheck`
  - `npm test` (`69` files, `312` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box List Template Lookup Slice

- Extended `src/modules/vm-box/VMBoxListDTOFactory.ts`.
- Extended `tests/vm-box-list-dto-factory.test.ts`.
- Added tested helpers for:
  - collecting unique VM Box template IDs;
  - building template maps from batched template lookup results;
  - resolving template records by stringified template ID.
- Optimized VM Box listing endpoints by loading templates in one batched query per list instead of one lookup per item:
  - `getSubmittedBoxes()`;
  - `getPublicBoxes()`;
  - `getPendingBoxes()`.
- Kept per-template PVE config reads unchanged for now; this slice only removes the MongoDB template N+1 lookup.
- Verified:
  - `npm run typecheck`
  - `npm test` (`69` files, `314` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Public Writeup Count Slice

- Extended `src/modules/vm-box/VMBoxListDTOFactory.ts`.
- Extended `tests/vm-box-list-dto-factory.test.ts`.
- Added tested helpers for:
  - collecting unique public box IDs;
  - building public writeup count maps from aggregation results;
  - defaulting missing public writeup counts to `0`.
- Optimized `VMBoxService.getPublicBoxes()` from one `BoxWriteupModel.countDocuments()` call per box to one aggregation grouped by `box_id`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`69` files, `316` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Writeup DTO Batch Lookup Slice

- Extended `src/modules/vm-box/VMBoxWriteupDTOFactory.ts`.
- Extended `tests/vm-box-writeup-dto-factory.test.ts`.
- Added tested helper inputs for batched writeup DTO lookup:
  - unique author/reviewer user ID collection;
  - unique box ID collection;
  - related entity map construction and lookup.
- Added `VMBoxService._toWriteupDTOs()` and migrated writeup list endpoints to it:
  - `getPublicBoxWriteups()`;
  - `getMyBoxWriteups()`;
  - `getBoxWriteupSubmissions()`.
- The migrated list paths now batch author, reviewer, box, and template reads instead of performing those lookups per writeup row.
- Verified:
  - `npm run typecheck`
  - `npm test` (`69` files, `319` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Submitted VM Box Published Lookup Slice

- Extended `src/modules/vm-box/VMBoxListDTOFactory.ts`.
- Extended `tests/vm-box-list-dto-factory.test.ts`.
- Added tested published-box lookup helpers for submitted-box lists:
  - `submitted_box_id` linked lookup for newer records;
  - legacy `vmtemplate_id` + `submitter_user_id` + `submitted_date` fallback lookup for older records;
  - linked lookup precedence over legacy fallback to match the existing service behavior.
- Optimized `VMBoxService.getSubmittedBoxes()` from one published-box lookup per approved submission to one batched `VMBoxModel.find()` query and a tested in-memory lookup.
- Kept single-record AI assistant update lookup unchanged to avoid broadening write-flow behavior in this slice.
- Verified:
  - `npm run typecheck`
  - `npm test` (`69` files, `321` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Delete Response Policy Slice

- Extended `src/modules/guacamole/GuacamoleConnectionLifecyclePolicy.ts`.
- Extended `tests/guacamole-connection-lifecycle-policy.test.ts`.
- Extracted Guacamole delete response classification from `GuacamoleService.deleteGuacamoleConnection()`:
  - successful empty/undefined responses;
  - `INTERNAL_ERROR` payloads;
  - `NOT_FOUND` payloads;
  - nested `error.message` payloads.
- `GuacamoleService.deleteGuacamoleConnection()` now keeps permission and delete orchestration while delete-response mapping lives in a tested lifecycle policy helper.
- `GuacamoleService.ts` is now about `1143` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`69` files, `323` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat VM Pending Action Policy Slice

- Added `src/modules/ai-chat/AIChatVMPendingActionPolicy.ts`.
- Added `tests/ai-chat-vm-pending-action-policy.test.ts`.
- Extracted VM action confirmation timing and pruning rules from `AIChatService`:
  - default five-minute pending action TTL;
  - custom TTL support for future persistence adapters;
  - expired and malformed pending-action ID collection.
- `AIChatService` now keeps in-memory storage orchestration while pending action timing/pruning decisions live in tested pure helpers.
- Verified:
  - `npm run typecheck`
  - `npm test` (`70` files, `326` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat VM Classifier Intent Policy Slice

- Extended `src/modules/ai-chat/AIChatVMIntentPolicy.ts`.
- Extended `tests/ai-chat-vm-intent-policy.test.ts`.
- Extracted VM classifier output handling from `AIChatService`:
  - direct JSON parsing;
  - JSON object extraction from surrounding model text;
  - invalid classifier output fallback to `null`;
  - classifier target/action normalization into `AIVMManagementAction`.
- `AIChatService._interpretVMManagementRequest()` now keeps model-call orchestration while classifier parsing/action normalization lives in the tested intent policy.
- `AIChatService.ts` is now about `675` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`70` files, `328` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 PVE QEMU Config DTO Factory Slice

- Added `src/modules/pve/PVEQemuConfigDTOFactory.ts`.
- Added `tests/pve-qemu-config-dto-factory.test.ts`.
- Extracted PVE QEMU config response projection from `PVEService`:
  - user-safe basic config DTO;
  - admin detailed config DTO;
  - status fallback to `stopped`;
  - disk-size extraction through the existing `PVEUtils` helper.
- Removed duplicated inline DTO assembly from `_getBasicQemuConfig()` and `_getDetailedQemuConfig()`, including the stale duplicate `vmid` assignment in the basic shape.
- `PVEService.ts` is now about `693` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`71` files, `330` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Task PVE Refresh Policy Slice

- Extended `src/modules/vm/VMTaskFactory.ts`.
- Extended `tests/vm-task-factory.test.ts`.
- Extracted PVE task status to local VM task refresh decisions from `PVEService._refreshAndUpdateTaskStatus()`:
  - running PVE tasks map to `in_progress` with PVE progress;
  - stopped `OK` tasks map to `completed` at `100%`;
  - stopped `null` exitstatus keeps current in-progress state;
  - stopped error exitstatus maps to `failed` and stores the error message;
  - PVE status errors and unchanged states skip DB updates.
- `PVEService._refreshAndUpdateTaskStatus()` now keeps PVE polling and persistence orchestration while refresh status mapping lives in a tested VM task factory helper.
- `PVEService.ts` is now about `657` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`71` files, `334` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Task PVE Status DTO Slice

- Extended `src/modules/vm/VMTaskFactory.ts`.
- Extended `tests/vm-task-factory.test.ts`.
- Extracted VM task with PVE status DTO projection from `PVEService._getTaskWithPVEStatus()`.
- Removed duplicate task DTO assembly from the success and error branches in `_getTaskWithPVEStatus()`.
- `PVEService.ts` is now about `636` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`71` files, `335` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 PVE Datacenter Node Status Policy Slice

- Added `src/modules/pve/PVEDatacenterStatusPolicy.ts`.
- Added `tests/pve-datacenter-status-policy.test.ts`.
- Extracted datacenter node status projection from `PVEService.getDatacenterStatus()`:
  - online/offline status;
  - CPU utilization percentage;
  - memory utilization percentage;
  - uptime seconds to days/hours/minutes/seconds DTO.
- `PVEService.getDatacenterStatus()` now keeps PVE/node-storage orchestration while node DTO projection lives in a tested policy helper.
- `PVEService.ts` is now about `617` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`72` files, `337` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template List DTO Factory Slice

- Added `src/modules/templates/TemplateListDTOFactory.ts`.
- Added `tests/template-list-dto-factory.test.ts`.
- Extracted template list DTO assembly from `TemplateService`:
  - template config projection into `VM_Template_Info`;
  - submitter user info mapping;
  - unique submitter ID collection for batched lookup.
- Optimized template listing endpoints by loading submitters in one batched query per list instead of one lookup per template:
  - `getAllTemplates()`;
  - `getAccessableTemplates()`.
- Kept per-template PVE config reads unchanged for now; this slice only removes the MongoDB submitter N+1 lookup and duplicate DTO construction.
- `TemplateService.ts` is now about `566` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`73` files, `340` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Submitted Template Details Lookup Slice

- Extended `src/modules/templates/TemplateListDTOFactory.ts`.
- Extended `tests/template-list-dto-factory.test.ts`.
- Extracted submitted-template detail DTO assembly and missing-template fallback construction from `TemplateService.getAllSubmittedTemplates()`.
- Optimized submitted-template listing by loading related templates and users in batched MongoDB lookups instead of per-submission template, owner, and submitter queries.
- Kept per-template PVE config reads unchanged for now; this slice only removes MongoDB N+1 lookups and duplicate response assembly.
- `TemplateService.ts` is now about `522` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`73` files, `343` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM List DTO Factory Slice

- Added `src/modules/vm/VMListDTOFactory.ts`.
- Added `tests/vm-list-dto-factory.test.ts`.
- Extracted VM list DTO assembly for basic VM list rows, owner-name lookup maps, and config/status error fallbacks.
- Optimized `VMService.getAllVMs()` by loading owner usernames in one batched query instead of one `UsersModel.findById()` per VM.
- Reused the DTO factory in `VMService.getUserOwnedVMs()` to keep VM list response fallback behavior consistent.
- `VMService.ts` is now about `314` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`74` files, `347` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Auth Registration Policy Slice

- Added `src/modules/auth/AuthRegistrationPolicy.ts`.
- Added `tests/auth-registration-policy.test.ts`.
- Extracted registration missing-field collection and username/email conflict classification from `AuthService.register()`.
- Optimized registration duplicate checks from separate username/email lookups to one `$or` identity lookup while preserving the unverified-email response priority.
- Verified:
  - `npm run typecheck`
  - `npm test` (`75` files, `351` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Class/Chapter ID Validation Slice

- Applied the shared `validateObjectIdInput()` policy to Class and Chapter route params:
  - class get/update/delete;
  - class creation under course;
  - chapter get/update/delete;
  - chapter creation under class.
- Preserved existing frontend-facing invalid ID messages while normalizing valid IDs before Mongoose queries.
- Removed direct `mongoose.Types.ObjectId.isValid()` ownership from `ClassService` and `ChapterService`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`75` files, `351` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course ID Validation Slice

- Applied the shared `validateObjectIdInput()` policy to Course route/body/query IDs while preserving existing response messages.
- Covered course read/update/delete/join/review/approval/submission/status/template lookup paths.
- Kept `mongoose.Types.ObjectId` only for new course ID generation; direct `ObjectId.isValid()` ownership is no longer in `CourseService`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`75` files, `351` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Operation Service Executor Slice

- Extended `src/modules/vm/VMOperationPolicy.ts`.
- Extended `tests/vm-operation-policy.test.ts`.
- Added tested operation message metadata for boot/shutdown/poweroff/reboot/reset response and fallback messages.
- Consolidated repeated `VMOperateService` operation flow into one shared private executor:
  - token validation;
  - VM ID validation;
  - VM lookup;
  - owner/SuperAdmin permission check;
  - current-state validation;
  - VMUtils operation invocation;
  - boot task wait and optional guest network identity normalization.
- Kept the public API methods and frontend-facing response messages stable.
- `VMOperateService.ts` is now about `161` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`75` files, `352` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Resource Context Slice

- Extended `src/modules/vm/VMResourcePolicy.ts`.
- Extended `tests/vm-resource-policy.test.ts`.
- Added tested helpers for initial used-resource persistence payloads and user attachment updates.
- Consolidated duplicated `VMManageService` used-resource loading/creation logic behind `_getOrCreateUsedResources()`.
- Reused the shared helper from create and update resource-limit checks while preserving existing response messages.
- `VMManageService.ts` is now about `1343` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`75` files, `353` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Execution State Policy Slice

- Extended `src/modules/ai-box-build/AIBoxBuildJobPolicy.ts`.
- Extended `tests/ai-box-build-job-policy.test.ts`.
- Extracted AI Box Build active/startable execution-state sets and delete/start conflict decisions from `AIBoxBuildService`.
- `deleteJob()` now delegates running/active deletion checks to the tested policy.
- `launchBuildRun()` now delegates running/startable execution-state checks to the tested policy while preserving conflict response messages.
- `_markStaleExecutionJobs()` now uses the shared active execution-state set.
- `AIBoxBuildService.ts` is now about `1389` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`75` files, `356` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Config Lifecycle Slice

- Extended `src/modules/guacamole/GuacamoleConnectionLifecyclePolicy.ts`.
- Extended `tests/guacamole-connection-lifecycle-policy.test.ts`.
- Added tested protocol-specific Guacamole create-failure message mapping for SSH/RDP/VNC.
- Consolidated repeated SSH/RDP/VNC connection config lookup/create behavior behind `GuacamoleService._getOrCreateConnectionConfig()`.
- Kept established connection response shape and existing frontend-facing failure messages stable.
- `GuacamoleService.ts` is now about `1104` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`75` files, `357` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Config Service Slice

- Added `src/modules/guacamole/GuacamoleConnectionConfigService.ts`.
- Added `tests/guacamole-connection-config-service.test.ts`.
- Moved Guacamole SSH/RDP/VNC get-or-create config lifecycle out of `GuacamoleService`:
  - existing connection list lookup;
  - same-name config reuse;
  - create-on-miss behavior;
  - list-failure fallback to creation;
  - protocol-specific create failure response mapping.
- `GuacamoleService._finalizeEstablishedConnection()` now delegates config lifecycle to the injectable `guacamoleConnectionConfigService`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`108` files, `545` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `GuacamoleService.ts` is now about `1040` lines after the extraction.

### 2026-05-26 Guacamole Auth Service Slice

- Added `src/modules/guacamole/GuacamoleAuthService.ts`.
- Added `tests/guacamole-auth-service.test.ts`.
- Moved Guacamole auth/user lifecycle out of `GuacamoleService`:
  - admin token retrieval;
  - user existence lookup;
  - missing-user creation;
  - CREATE_CONNECTION permission patching;
  - scheduled permission verification;
  - user token retrieval with datasource fallback.
- `GuacamoleService` now keeps request-level user validation/config checks while delegating Guacamole token and user provisioning behavior to the injectable auth service.
- Verified:
  - `npm run typecheck`
  - `npm test` (`109` files, `552` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `GuacamoleService.ts` is now about `868` lines after the extraction.

### 2026-05-26 Guacamole Connection Management Service Slice

- Added `src/modules/guacamole/GuacamoleConnectionManagementService.ts`.
- Added `tests/guacamole-connection-management-service.test.ts`.
- Moved Guacamole connection list/delete lifecycle out of `GuacamoleService`:
  - user connection list API call and DTO projection;
  - invalid list payload handling;
  - delete admin-token lookup;
  - delete permission connection lookup;
  - SuperAdmin delete fallback when lookup fails;
  - delete response classification and success payload assembly.
- `GuacamoleService` now keeps request-level configuration/auth and connection ID validation while delegating Guacamole list/delete API behavior to the injectable management service.
- Verified:
  - `npm run typecheck`
  - `npm test` (`110` files, `560` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `GuacamoleService.ts` is now about `754` lines after the extraction.

### 2026-05-26 VM Box Review Policy Slice

- Added `src/modules/vm-box/VMBoxReviewPolicy.ts`.
- Added `tests/vm-box-review-policy.test.ts`.
- Extracted VM Box review ID normalization, review membership checks, review ownership checks, rating update payloads, and review response payload builders from `VMBoxService`.
- Updated `rateBox()`, `updateBoxReview()`, and `deleteBoxReview()` to use the tested review policy helpers while preserving response messages and payload shapes.
- `VMBoxService.ts` is now about `1235` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`76` files, `361` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Execution Transition Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildExecutionPolicy.ts`.
- Added `tests/ai-box-build-execution-policy.test.ts`.
- Extracted AI Box Build run queued state, provisioning snapshot assembly, completion state, failure state, and validation-blocked state from `AIBoxBuildService`.
- Updated `launchBuildRun()` and `_executeBuildRun()` to use the tested execution transition helpers while preserving run log messages and response behavior.
- `AIBoxBuildService.ts` is now about `1387` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`77` files, `365` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Review Policy Slice

- Added `src/modules/courses/CourseReviewPolicy.ts`.
- Added `tests/course-review-policy.test.ts`.
- Extracted Course review input validation wrapper, review ID normalization, review membership checks, review ownership checks, rating update payloads, and review response payload builders from `CourseService`.
- Updated `rateCourse()`, `updateCourseReview()`, and `deleteCourseReview()` to use the tested Course review policy helpers while preserving response messages and payload shapes.
- `CourseService.ts` is now about `1051` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`78` files, `370` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Menu DTO Factory Slice

- Added `src/modules/courses/CourseMenuDTOFactory.ts`.
- Added `tests/course-menu-dto-factory.test.ts`.
- Extracted Course menu chapter ID collection, Course menu DTO assembly, and first-template selection from `CourseService`.
- Updated `getCourseMenu()` and `getFirstTemplateByCourseID()` to use the tested helpers while preserving response messages and template selection order.
- `CourseService.ts` is now about `1021` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`79` files, `373` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Page DTO Factory Slice

- Added `src/modules/courses/CoursePageDTOFactory.ts`.
- Added `tests/course-page-dto-factory.test.ts`.
- Extracted Course page DTO assembly and submitter info projection from `CourseService`.
- Updated `getCourseById()` to use the tested DTO factory while preserving authorization behavior and response messages.
- `CourseService.ts` is now about `1006` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`80` files, `375` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build SSH Execution Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildSSHExecutionPolicy.ts`.
- Added `tests/ai-box-build-ssh-execution-policy.test.ts`.
- Extracted AI Box Build SSH/SCP generated-script execution command planning from `AIBoxBuildService`.
- Updated `_uploadAndRunScript()` to use the tested command plan while preserving remote paths, log messages, root/non-root execution behavior, and timeout/env handling.
- `AIBoxBuildService.ts` is now about `1372` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`81` files, `377` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Workspace Context Slice

- Extended `src/modules/ai-box-build/AIBoxBuildWorkspacePolicy.ts`.
- Extended `tests/ai-box-build-workspace-policy.test.ts`.
- Extracted AI Box Build `build-context.json` payload assembly from `AIBoxBuildService`.
- Updated `_prepareOpencodeWorkspace()` to use the tested workspace context helper while preserving generated context field names and values.
- `AIBoxBuildService.ts` is now about `1374` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`81` files, `378` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Generated Script Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildGeneratedScriptPolicy.ts`.
- Added `tests/ai-box-build-generated-script-policy.test.ts`.
- Extracted generated `setup.sh` / `validation.sh` path building, missing-script errors, and bash script readiness validation from `AIBoxBuildService`.
- Updated `_ensureGeneratedScript()` to use the tested policy while preserving chmod behavior and fallback-triggering error messages.
- `AIBoxBuildService.ts` is now about `1378` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`82` files, `381` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Provisioning Policy Slice

- Added `src/modules/ai-box-build/AIBoxBuildProvisioningPolicy.ts`.
- Added `tests/ai-box-build-provisioning-policy.test.ts`.
- Extracted AI Box Build VM creation/boot error messages, provisioning log messages, cloud-init log messages, guest network identity summary/failure messages, and VM IP selection/wait log rules from `AIBoxBuildService`.
- Updated `_provisionAndBootVM()`, `_prepareCloudInitBeforeBoot()`, `_normalizeGuestNetworkIdentityAfterBoot()`, and `_waitForVMIP()` to use the tested policy helpers while preserving log text and behavior.
- `AIBoxBuildService.ts` is now about `1391` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`83` files, `385` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Config Operation Executor Slice

- Added `src/modules/vm/VMConfigOperationPolicy.ts`.
- Added `tests/vm-config-operation-policy.test.ts`.
- Extracted VM config operation metadata for name, CPU, memory, disk, and cloud-init PVE actions.
- Consolidated repeated VM config operation execution in `VMManageService` behind `_runVMConfigOperation()`:
  - task step in-progress update;
  - PVE operation invocation;
  - optional UPID wait;
  - completion/failure step updates;
  - caught error normalization.
- Reused the shared executor from VM name, CPU, memory, disk resize, and cloud-init paths while preserving existing step messages.
- `VMManageService.ts` is now about `1268` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`84` files, `387` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Established Connection Policy Slice

- Added `src/modules/guacamole/GuacamoleEstablishedConnectionPolicy.ts`.
- Added `tests/guacamole-established-connection-policy.test.ts`.
- Extracted Guacamole established-connection success messages, direct-session log messages, success logs, and Guacamole establish-failure messages by protocol.
- Added `GuacamoleService._buildEstablishedConnection()` to centralize direct URL generation and established connection DTO assembly.
- Updated SSH/RDP/VNC establish flows to use the shared finalization helper and tested message policy while preserving existing response text.
- Verified:
  - `npm run typecheck`
  - `npm test` (`85` files, `390` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Submission Audit Payload Slice

- Extended `src/modules/vm-box/VMBoxSubmissionAuditPolicy.ts`.
- Extended `tests/vm-box-submission-audit-policy.test.ts`.
- Extracted VM Box submission audit status update payloads, approved VMBox creation payloads, and audit notification email payloads from `VMBoxService`.
- Updated `auditBoxSubmission()` to use the tested policy helpers while preserving approved/rejected messages and created VMBox fields.
- `VMBoxService.ts` is now about `1218` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`85` files, `393` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Writeup DTO Helper Consolidation Slice

- Consolidated `VMBoxService._toWriteupDTO()` through the existing batched `_toWriteupDTOs()` path.
- Removed duplicate single-writeup author/reviewer/box/template lookup and DTO assembly logic from `VMBoxService`.
- Kept the existing batched DTO factory and response shapes unchanged.
- `VMBoxService.ts` is now about `1202` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`85` files, `393` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Answer Record Consolidation Slice

- Extended `src/modules/vm-box/VMBoxAnswerPolicy.ts`.
- Extended `tests/vm-box-answer-policy.test.ts`.
- Extracted VM Box answer submission outcome rules from `VMBoxService.submitBoxAnswer()`:
  - already-correct idempotent response;
  - correct/incorrect response messages;
  - whether a newly correct flag should be persisted.
- Consolidated repeated answer-record load-or-create behavior behind `VMBoxService._getOrCreateAnswerRecord()`.
- Updated `getMyAnswerRecord()` and `submitBoxAnswer()` to use the shared answer-record helper while preserving response shapes and dynamic flag-field persistence behavior.
- `VMBoxService.ts` is now about `1201` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`85` files, `396` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Template Info Consolidation Slice

- Extended `src/modules/vm-box/VMBoxListDTOFactory.ts`.
- Extended `tests/vm-box-list-dto-factory.test.ts`.
- Extracted QEMU config plus VM template metadata projection into `buildVMBoxTemplateInfoFromQemuConfig()`.
- Added `VMBoxService._buildVMBoxTemplateInfo()` and reused it from:
  - `getSubmittedBoxes()`;
  - `getPublicBoxes()`;
  - `getPendingBoxes()`.
- Removed three repeated template-info assembly blocks from `VMBoxService` while preserving fallback behavior and response shapes.
- `VMBoxService.ts` is now about `1160` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`85` files, `398` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Preflight Policy Slice

- Added `src/modules/guacamole/GuacamoleConnectionPreflightPolicy.ts`.
- Added `tests/guacamole-connection-preflight-policy.test.ts`.
- Extracted Guacamole SSH/RDP/VNC preflight message rules from `GuacamoleService`:
  - service-not-configured response text and protocol-specific log messages;
  - authentication failure response text;
  - VM display-name fallback from VM config/PVE VMID;
  - SSH/RDP/VNC service connectivity failure messages.
- Updated SSH/RDP/VNC establish flows to use the tested preflight policy while preserving response text.
- `GuacamoleService.ts` is now about `1124` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`86` files, `402` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Shared Connection Preflight Lifecycle Slice

- Added `GuacamoleService._prepareConnectionPreflight()`.
- Consolidated repeated SSH/RDP/VNC connection preflight orchestration:
  - VM ownership/SuperAdmin permission check;
  - running-state check;
  - guest-network IP resolution;
  - protocol service connectivity check;
  - VM display-name lookup;
  - Guacamole user token acquisition and datasource fallback.
- Updated `establishSSHConnection()`, `establishRDPConnection()`, and `establishVNCConnection()` to use the shared preflight helper before protocol-specific profile creation.
- Kept existing protocol-specific credential validation, connection profile factories, config lookup/create flow, established response shape, and user-facing response text.
- `GuacamoleService.ts` is now about `1122` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`86` files, `402` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Established Response Lifecycle Slice

- Added `GuacamoleService._finalizeEstablishedConnection()`.
- Consolidated repeated SSH/RDP/VNC post-profile connection orchestration:
  - Guacamole config lookup/create via the shared lifecycle helper;
  - direct session/established connection DTO creation;
  - protocol success logging;
  - protocol success response message.
- Updated `establishSSHConnection()`, `establishRDPConnection()`, and `establishVNCConnection()` so each method now keeps only protocol-specific request validation and profile construction after the shared preflight.
- `GuacamoleService.ts` is now about `1101` lines after the consolidation.
- Verified:
  - `npm run typecheck`
  - `npm test` (`86` files, `402` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Run Log Persistence Policy Slice

- Extended `src/modules/ai-box-build/AIBoxBuildRunLogPolicy.ts`.
- Extended `tests/ai-box-build-run-log-policy.test.ts`.
- Extracted AI Box Build run-log append/persistence rules:
  - in-memory append with recent-entry retention;
  - Mongo `$push`/`$each`/`$slice` payload construction;
  - shared redaction and message tailing through `makeAIBoxRunLog()`.
- Updated `AIBoxBuildService` run launch, stale-job marking, run completion/failure, provisioning, status updates, and append-log helper to use the tested run-log policy helpers instead of handwritten run-log update payloads.
- `AIBoxBuildService.ts` is now about `1384` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`86` files, `404` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Creation Response Policy Slice

- Added `src/modules/vm/VMCreationResponsePolicy.ts`.
- Added `tests/vm-creation-response-policy.test.ts`.
- Extracted VM creation response surface rules from `VMManageService`:
  - invalid VM name message;
  - clone failure message;
  - configuration-cleanup failure message;
  - successful creation message and response body shape.
- Updated `createVMFromTemplate()` and `createVMFromBoxTemplate()` to use the tested response policy while preserving response text and payload fields.
- Verified:
  - `npm run typecheck`
  - `npm test` (`87` files, `406` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Creation Shared Clone/Finalize Workflow Slice

- Added `VMManageService._cloneConfigureAndRegisterVM()`.
- Consolidated the duplicated core VM creation workflow used by `createVMFromTemplate()` and `createVMFromBoxTemplate()`:
  - old task retention cleanup;
  - VM creation task creation;
  - orphan cloud-init disk cleanup;
  - template clone and clone task status update;
  - VM configuration/finalization;
  - used-resource and owned-VM persistence;
  - optional box VM metadata marking;
  - failed configuration cleanup and failure response.
- Kept each public method responsible for its own request validation, template/box lookup, cloud-init credential selection, and resource-limit checks.
- Verified:
  - `npm run typecheck`
  - `npm test` (`87` files, `406` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Run Completion Persistence Slice

- Extended `src/modules/ai-box-build/AIBoxBuildExecutionPolicy.ts`.
- Extended `tests/ai-box-build-execution-policy.test.ts`.
- Extracted AI Box Build run completion/failure persistence payload rules:
  - completion validation report, phase, execution status, job status, error message, next actions, and appended success log;
  - failure execution status, job status, error message, timestamp, and persisted error-log push payload.
- Updated `AIBoxBuildService._executeBuildRun()` to apply the tested execution persistence helpers instead of assigning completion/failure fields inline.
- `AIBoxBuildService.ts` is now about `1379` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`87` files, `408` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Workspace Artifact Refresh Policy Slice

- Extended `src/modules/ai-box-build/AIBoxBuildWorkspacePolicy.ts`.
- Extended `tests/ai-box-build-workspace-policy.test.ts`.
- Extracted workspace artifact refresh update assembly from `AIBoxBuildService._refreshArtifactsFromWorkspace()`:
  - design/setup/writeup markdown baseline insertion;
  - generated setup script command mirroring into setup markdown;
  - final `artifacts` update payload and `updated_at` timestamp.
- `AIBoxBuildService._refreshArtifactsFromWorkspace()` now owns filesystem reads and DB persistence only, while artifact shaping lives in the tested workspace policy.
- `AIBoxBuildService.ts` is now about `1364` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`87` files, `409` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Reference Fallback Workspace Payload Slice

- Extended `src/modules/ai-box-build/AIBoxBuildReferencePolicy.ts`.
- Extended `tests/ai-box-build-reference-policy.test.ts`.
- Extracted AI Box Build reference-backed fallback artifact assembly from `AIBoxBuildService._writeReferenceFallbackFiles()`:
  - fallback `design.md` source/challenge/service-map payload construction;
  - sanitized reference setup and ETHCI notes in `setup.md`;
  - generated `setup.sh` command mirroring in `setup.md`;
  - normalized writeup baseline and host/IP rewrites.
- Updated `_writeReferenceFallbackFiles()` so the service keeps reference/asset filesystem I/O, script writes, chmod, and run-log persistence while tested policy builds markdown payloads.
- `AIBoxBuildService.ts` is now about `1294` lines after the extraction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`87` files, `410` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Pass-through Wrapper Cleanup Slice

- Removed remaining no-logic private wrappers from `AIBoxBuildService` after equivalent policy helpers were already tested:
  - OpenCode workspace instructions/config/model/bin wrappers;
  - agent completion normalization and response parsing wrappers;
  - artifact usability/raw coercion wrappers;
  - unused run-log and parsed-response wrappers.
- Updated call sites to use tested policy helpers directly while preserving command arguments, generated workspace files, model normalization, and artifact repair behavior.
- `AIBoxBuildService.ts` is now about `1253` lines after the cleanup.
- Verified:
  - `npm run typecheck`
  - `npm test` (`87` files, `410` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Creation Request Policy Slice

- Added `src/modules/vm/VMCreationRequestPolicy.ts`.
- Added `tests/vm-creation-request-policy.test.ts`.
- Extracted shared VM creation request/identity rules used by `createVMFromTemplate()` and `createVMFromBoxTemplate()`:
  - stable payload construction for `VMUtils.validateVMCreationParams()`;
  - next VM ID and sanitized VM name identity payload;
  - invalid VM name response message reuse.
- Updated both VM creation entry points to use the tested policy, and removed unused template `qemuConfig` destructuring from those paths.
- Verified:
  - `npm run typecheck`
  - `npm test` (`88` files, `414` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Dependency Runtime Cleanup Slice

- Removed unused runtime dependency `file-type` from `package.json` and `package-lock.json`.
- Verified no source/test imports or requires for `file-type` remained before removal.
- Rechecked Phase 9 dependency posture:
  - Node built-ins (`fs`, `http`, `https`, `path`) are used as built-ins only, not installed dependencies;
  - `@types/*` packages are already in `devDependencies`;
  - required Node runtime is documented with `engines.node >=20`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`88` files, `414` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat Input Sanitization Policy Slice

- Extended `src/modules/ai-chat/AIChatRequestPolicy.ts`.
- Extended `tests/ai-chat-request-policy.test.ts`.
- Extracted AI Chat prompt-injection input sanitization from `AIChatService._sanitizeUserInput()`:
  - trims validated user input;
  - filters known instruction override markers;
  - filters chat/template sentinel tokens and HTML comment markers;
  - caps sanitized text at `AI_CHAT_MAX_INPUT_LENGTH`.
- Updated box hint, platform guide, and VM management flows to use the tested sanitizer directly.
- Removed the private service wrapper; `AIChatService.ts` is now about `649` lines.
- Verified:
  - `npm run typecheck`
  - `npm test` (`88` files, `416` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Submission Create Persistence Slice

- Extended `src/modules/vm-box/VMBoxSubmissionCreatePolicy.ts`.
- Extended `tests/vm-box-submission-create-policy.test.ts`.
- Extracted `VMBoxService.submitBox()` submission persistence and success response assembly:
  - submitted-box creation payload with submitter, status, submitted date, sanitized fields, flag answers, and AI-assistant setting;
  - stable success response payload with submission id, template id, submitted date, and submitter email.
- Updated `submitBox()` so the service keeps auth, template existence check, model save, and logging while tested policy owns payload shape.
- `VMBoxService.ts` is now about `1156` lines.
- Verified:
  - `npm run typecheck`
  - `npm test` (`88` files, `418` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Create/Update Payload Policy Slice

- Extended `src/modules/courses/CourseContentPolicy.ts`.
- Extended `tests/course-content-policy.test.ts`.
- Extracted Course create/update persistence and response payload rules from `CourseService`:
  - new-course payload defaults for reviews, rating, class IDs, update date, submitter, and editing status;
  - update payload timestamping and reset-to-editing status behavior;
  - stable `{ course_id }` mutation response body.
- Updated `AddCourse()` and `UpdateCourseById()` so the service keeps auth, duplicate checks, persistence, rollback, and logging while tested policy owns payload shape.
- `CourseService.ts` is now about `997` lines.
- Verified:
  - `npm run typecheck`
  - `npm test` (`88` files, `421` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Review Request Policy Slice

- Added `src/modules/courses/CourseReviewRequestPolicy.ts`.
- Added `tests/course-review-request-policy.test.ts`.
- Extracted Course review request validation from `CourseService` for:
  - review create body (`course_id`, `rating`, `comment`);
  - review list query (`course_id`);
  - review update params/body (`review_id`, `course_id`, `rating`, `comment`);
  - review delete params/query (`review_id`, `course_id`).
- Preserved existing Course review error messages while aligning the shape with VM Box review request policy.
- Updated Course review endpoints to use normalized policy results.
- `CourseService.ts` is now about `979` lines.
- Verified:
  - `npm run typecheck`
  - `npm test` (`89` files, `426` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Shared Review Persistence Payload Slice

- Extended `src/modules/reviews/ReviewPolicy.ts`.
- Extended `tests/review-policy.test.ts`.
- Extracted shared review create/update persistence payload rules:
  - reviewer id, rating score, optional sanitized comment, and submitted date for new reviews;
  - rating score and optional sanitized comment for review updates.
- Updated Course and VM Box review create/update flows to use the shared payload helpers while preserving rating recalculation and response shapes.
- Verified:
  - `npm run typecheck`
  - `npm test` (`89` files, `428` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Membership ID Update Policy Slice

- Extended `src/modules/courses/CourseAccessPolicy.ts`.
- Extended `tests/course-access-policy.test.ts`.
- Extracted Course membership ID update rules:
  - normalize existing `course_ids`;
  - append a course id;
  - preserve insertion order while removing duplicates.
- Updated `AddCourse()` and `JoinCourseById()` to use the tested helper instead of hand-written push/set construction.
- Verified:
  - `npm run typecheck`
  - `npm test` (`89` files, `429` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Deletion Response Payload Policy Slice

- Extended `src/modules/vm/VMDeletionPolicy.ts`.
- Extended `tests/vm-deletion-policy.test.ts`.
- Extracted VM deletion success/error response body construction from `VMManageService.deleteUserVM()`:
  - immediate deletion response payload;
  - async deletion task response payload;
  - PVE deletion error response payload.
- Updated `deleteUserVM()` to keep orchestration and cleanup while tested policy owns response body shape.
- Verified:
  - `npm run typecheck`
  - `npm test` (`89` files, `431` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Resource Usage Update Payload Slice

- Extended `src/modules/vm/VMResourcePolicy.ts`.
- Extended `tests/vm-resource-policy.test.ts`.
- Extracted UsedComputeResource `$inc` payload rules from `VMManageService`:
  - VM creation resource usage increments;
  - VM deletion resource reclaim decrements;
  - string/number memory and disk-size normalization for reclaim payloads.
- Updated VM creation and deletion resource accounting paths to use the tested policy helpers.
- Verified:
  - `npm run typecheck`
  - `npm test` (`89` files, `433` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Success Payload Policy Slice

- Extended `src/modules/guacamole/GuacamoleConnectionLifecyclePolicy.ts`.
- Extended `tests/guacamole-connection-lifecycle-policy.test.ts`.
- Extracted Guacamole disconnect/delete success response body construction from `GuacamoleService`:
  - disconnect payload message, connection ID, and ISO timestamp;
  - delete payload connection ID, connection name, deletion timestamp, and deleting user.
- Updated `disconnectGuacamoleConnection()` and `deleteConnection()` so the service keeps validation, permissions, auth, and API orchestration while tested lifecycle helpers own response body shape.
- Verified:
  - `npm run typecheck`
  - `npm test` (`89` files, `435` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Auth Token Policy Slice

- Added `src/modules/guacamole/GuacamoleAuthPolicy.ts`.
- Added `tests/guacamole-auth-policy.test.ts`.
- Extracted Guacamole admin/user token response parsing from `GuacamoleService`:
  - `authToken` and `token` response compatibility;
  - datasource fallback to `postgresql`;
  - username projection into the auth-token DTO;
  - stable admin/user authentication failure and missing-token messages.
- Updated `_getAdminAuthToken()` and `_ensureUserAndGetToken()` so the service keeps API calls, user creation orchestration, and logging while tested policy helpers own token DTO/error classification.
- Verified:
  - `npm run typecheck`
  - `npm test` (`90` files, `440` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole User Permission Policy Slice

- Added `src/modules/guacamole/GuacamoleUserPolicy.ts`.
- Added `tests/guacamole-user-policy.test.ts`.
- Extracted Guacamole user lifecycle rules from `GuacamoleService`:
  - user lookup NOT_FOUND/error classification;
  - project user creation payload shape;
  - user creation/permission mutation response classification;
  - CREATE_CONNECTION permission patch operations;
  - CREATE_CONNECTION permission verification messages.
- Updated `_createGuacamoleUser()`, `_setUserPermissions()`, and `_verifyUserPermissions()` so the service keeps admin token retrieval, API calls, delayed verification, and logging while tested policy helpers own payload and permission decision rules.
- Updated `_checkGuacamoleUserExists()` to delegate Guacamole user lookup response classification to the same tested policy.
- Verified:
  - `npm run typecheck`
  - `npm test` (`91` files, `446` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Persistence Payload Policy Slice

- Added `src/modules/vm/VMPersistencePolicy.ts`.
- Added `tests/vm-persistence-policy.test.ts`.
- Extracted VM persistence payload rules from `VMManageService`:
  - VM record creation payloads including owner and optional `fromTemplateId`;
  - user `owned_vms` attach/detach update payloads;
  - box VM metadata update payloads.
- Updated VM creation registration, failed-creation cleanup, box VM marking, and VM deletion database cleanup paths to use the tested persistence policy helpers while keeping DB orchestration inside `VMManageService`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`92` files, `450` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Config Update Response Payload Slice

- Extended `src/modules/vm/VMConfigUpdatePolicy.ts`.
- Extended `tests/vm-config-update-policy.test.ts`.
- Extracted VM config update success response body construction from `VMManageService`:
  - task ID, VM record ID, PVE VMID, and updated CPU/memory/disk fields;
  - optional `vm_name` only when the VM name was changed.
- Updated `updateVMConfig()` so the service keeps auth, VM lookup, resource checks, PVE orchestration, and task updates while tested policy helpers own the frontend-facing response payload shape.
- Verified:
  - `npm run typecheck`
  - `npm test` (`92` files, `452` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Deletion Precondition Policy Slice

- Extended `src/modules/vm/VMDeletionPolicy.ts`.
- Extended `tests/vm-deletion-policy.test.ts`.
- Extracted VM deletion precondition rules from `VMManageService`:
  - SuperAdmin can delete any VM;
  - regular users can delete only owned VM IDs;
  - running VMs are rejected before PVE delete;
  - stopped, unknown, or unavailable VM status preserves the existing deletion behavior.
- Updated `deleteUserVM()` to use the tested policy helpers for ownership and power-state decisions while keeping token validation, VM lookup, PVE deletion, resource reclaim, and database cleanup orchestration in the service.
- Verified:
  - `npm run typecheck`
  - `npm test` (`92` files, `457` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Deletion PVE API Error Policy Slice

- Extended `src/modules/vm/VMDeletionPolicy.ts`.
- Extended `tests/vm-deletion-policy.test.ts`.
- Extracted VM deletion PVE API failure message construction from `VMManageService`:
  - invalid JSON/SyntaxError responses keep the existing `PVE API returned invalid JSON response` message;
  - general Error objects keep their error message;
  - unknown thrown values fall back to `Unknown error`.
- Updated `deleteUserVM()` to delegate PVE delete API failure wording to the tested deletion policy while keeping PVE request orchestration in the service.
- Verified:
  - `npm run typecheck`
  - `npm test` (`92` files, `459` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Ownership Repository Slice

- Added `src/modules/vm/VMRepository.ts`.
- Added `tests/vm-repository.test.ts`.
- Moved VM ownership persistence operations out of `VMManageService` into an injectable repository:
  - VM record creation with user ownership attachment;
  - VM record lookup by Mongo ID;
  - VM record lookup by PVE identity;
  - VM record deletion;
  - owned VM detachment;
  - box VM metadata updates.
- Repository tests use injected fake model adapters to verify Mongo query/update shapes without requiring a live MongoDB instance.
- Updated `VMManageService` VM lookup, creation, failed-creation cleanup, VM deletion database cleanup, and box VM marking paths to call the repository while preserving existing response behavior.
- Verified:
  - `npm run typecheck`
  - `npm test` (`93` files, `464` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Task Repository Slice

- Added `src/modules/vm/VMTaskRepository.ts`.
- Added `tests/vm-task-repository.test.ts`.
- Moved VM task persistence operations out of `VMManageService` into an injectable repository:
  - VM task creation;
  - task status/step updates by task ID;
  - newest-first user task reference listing for retention cleanup;
  - old task deletion by task IDs.
- Repository tests use injected fake adapters to verify DB operation boundaries without requiring MongoDB.
- Updated `VMManageService` VM creation/update task creation, task status/step updates, and old-task cleanup paths to call the repository while preserving existing task factory payload rules.
- Verified:
  - `npm run typecheck`
  - `npm test` (`94` files, `468` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Resource Repository Slice

- Added `src/modules/vm/VMResourceRepository.ts`.
- Added `tests/vm-resource-repository.test.ts`.
- Moved VM resource persistence operations out of `VMManageService` into an injectable repository:
  - user used-resource lookup before usage updates/reclaim;
  - used-resource update by resource ID;
  - used-resource get-or-create with user attachment;
  - compute resource plan lookup by ID.
- Updated `VMManageService` resource usage increment, resource reclaim, create/update resource-limit checks, and used-resource initialization paths to call the repository while preserving existing policy decisions and response messages.
- Confirmed `VMManageService` no longer directly references `VMModel`, `VM_TaskModel`, `UsersModel`, `UsedComputeResourceModel`, or `ComputeResourcePlanModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`95` files, `473` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Creation Source Repository Slice

- Added `src/modules/vm/VMCreationSourceRepository.ts`.
- Added `tests/vm-creation-source-repository.test.ts`.
- Moved VM creation source lookups out of `VMManageService` into an injectable repository:
  - VM template lookup by template ID;
  - VM box lookup by box ID for box-template VM creation.
- Removed stale `SubmittedBoxModel` import from `VMManageService`.
- Confirmed `VMManageService` no longer directly references `VMModel`, `VM_TaskModel`, `UsersModel`, `UsedComputeResourceModel`, `ComputeResourcePlanModel`, `VMTemplateModel`, `VMBoxModel`, or `SubmittedBoxModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`96` files, `475` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Job Repository Slice

- Added `src/modules/ai-box-build/AIBoxBuildJobRepository.ts`.
- Added `tests/ai-box-build-job-repository.test.ts`.
- Moved AI Box Build job persistence operations out of `AIBoxBuildService` into an injectable repository:
  - job create/list/get/delete;
  - job update/update-many;
  - limited stale-job candidate lookup;
  - atomic queue/start `findOneAndUpdate`.
- Updated AI Box Build create/list/get/delete/status/message/run/stale/run-log/workspace/provisioning paths to use the repository while preserving existing document `save()` flows where a loaded job document is intentionally mutated.
- Reused the VM repository for AI Box Build VM-record polling, removing direct `VMModel` access from `AIBoxBuildService`.
- Confirmed `AIBoxBuildService` no longer directly references `AIBoxBuildJobModel` or `VMModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`97` files, `481` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole VM Repository Lookup Slice

- Updated `GuacamoleService._validateVMPermission()` to use the shared `VMRepository.findById()` instead of direct `VMModel.findById()`.
- Reused existing VM repository tests for the lookup behavior and Guacamole preflight/request policy tests for nearby connection validation behavior.
- Verified:
  - `npm run typecheck`
  - `npm test` (`97` files, `481` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Answer Repository Slice

- Added `src/modules/vm-box/VMBoxRepository.ts`.
- Added `src/modules/vm-box/VMBoxAnswerRecordRepository.ts`.
- Added `tests/vm-box-repository.test.ts`.
- Added `tests/vm-box-answer-record-repository.test.ts`.
- Moved VM Box answer-flow persistence boundaries out of `VMBoxService`:
  - answer VM lookup now reuses shared `VMRepository.findById()`;
  - VM box lookup uses `VMBoxRepository.findById()`;
  - answer-record load/create/attach-to-VM behavior is owned by `VMBoxAnswerRecordRepository`.
- Expanded the VM box repository lookup to shared single-box reads in review, writeup, AI-assistant, and answer flows.
- Preserved existing behavior where a missing or failed answer-record lookup creates a fresh answer record and saves its ID back to the VM document.
- Confirmed `VMBoxService` no longer directly references `VMModel` or `AnswerRecordModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`99` files, `485` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box SubmittedBox Repository Slice

- Added `src/modules/vm-box/VMBoxSubmissionRepository.ts`.
- Added `tests/vm-box-submission-repository.test.ts`.
- Moved submitted-box persistence boundaries out of `VMBoxService` for:
  - submission document creation;
  - newest-first submitted-box listing;
  - submitted-box lookup by ID;
  - status-filtered pending-box listing;
  - linked AI-assistant setting updates.
- Preserved document `save()` behavior in audit and submitted-box AI-assistant mutation paths so status updates and existing response shapes stay unchanged.
- Confirmed `VMBoxService` no longer directly references `SubmittedBoxModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`100` files, `490` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Published Repository Slice

- Expanded `src/modules/vm-box/VMBoxRepository.ts`.
- Expanded `tests/vm-box-repository.test.ts`.
- Moved VM box persistence boundaries out of `VMBoxService` for:
  - approved VM box document creation after submission audit;
  - public VM box listing;
  - batched box lookup for writeup DTOs;
  - owned box ID lookup for admin writeup moderation filters;
  - linked and legacy fallback published-box lookup for submitted-box views and AI-assistant setting sync.
- Confirmed `VMBoxService` no longer directly references `VMBoxModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`100` files, `498` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Writeup Repository Slice

- Added `src/modules/vm-box/VMBoxWriteupRepository.ts`.
- Added `tests/vm-box-writeup-repository.test.ts`.
- Moved VM box writeup persistence boundaries out of `VMBoxService` for:
  - public writeup count aggregation;
  - active pending/approved writeup checks;
  - writeup document creation;
  - public approved writeup listing;
  - newest-first writeup listing by caller-provided filter;
  - writeup lookup by ID for review and visibility mutation flows.
- Preserved existing document `save()` behavior for writeup review, visibility updates, and newly submitted writeups.
- Confirmed `VMBoxService` no longer directly references `BoxWriteupModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`101` files, `505` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Shared Review Repository Slice

- Added `src/modules/reviews/ReviewRepository.ts`.
- Added `tests/review-repository.test.ts`.
- Moved Course and VM Box review persistence boundaries out of `CourseService` and `VMBoxService` for:
  - duplicate review lookup inside a box review ID set;
  - review document creation;
  - review list lookup by IDs for DTO assembly and rating recalculation;
  - review lookup by ID for update/delete permission checks;
  - review deletion.
- Preserved existing document `save()` behavior for review create/update and existing Course/VM Box rating recalculation semantics.
- Confirmed `CourseService` and `VMBoxService` no longer directly reference `ReviewsModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`102` files, `511` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box User/Template Lookup Repository Slice

- Added `src/modules/users/UserRepository.ts`.
- Added `src/modules/vm/VMTemplateRepository.ts`.
- Added `tests/user-repository.test.ts`.
- Added `tests/vm-template-repository.test.ts`.
- Moved VM Box user/template lookup boundaries out of `VMBoxService` for:
  - writeup DTO author/reviewer lookup;
  - writeup DTO related template lookup;
  - submitted/public/pending box submitter and template maps;
  - submitted-box template existence and audit template lookup;
  - audit notification recipient lookup;
  - box review reviewer info lookup.
- Confirmed `VMBoxService` no longer directly references `UsersModel`, `VMTemplateModel`, `ReviewsModel`, `BoxWriteupModel`, `SubmittedBoxModel`, `VMBoxModel`, `AnswerRecordModel`, or `VMModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`104` files, `519` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course User Repository Slice

- Expanded `src/modules/users/UserRepository.ts`.
- Expanded `tests/user-repository.test.ts`.
- Moved Course user persistence boundaries out of `CourseService` for:
  - course page submitter lookup;
  - course list submitter lookup;
  - reviewer DTO user lookup;
  - invitation recipient email lookup;
  - course membership updates when adding/joining courses;
  - course removal from all users when deleting a course.
- Confirmed `CourseService` and `VMBoxService` no longer directly reference `UsersModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`104` files, `523` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Repository Slice

- Added `src/modules/courses/CourseRepository.ts`.
- Added `tests/course-repository.test.ts`.
- Moved Course persistence boundaries out of `CourseService` for:
  - course document creation and rollback deletion;
  - lookup by ID for page/menu/join/review/audit/submit/status flows;
  - duplicate course-name lookup;
  - course update by ID;
  - delete by ID;
  - public/all/submitted course listing.
- Preserved existing document `save()` behavior for status and rating mutations that still operate on loaded Course documents.
- Confirmed `CourseService` and `VMBoxService` no longer directly reference `CourseModel`, `UsersModel`, or `ReviewsModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`105` files, `531` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Class/Chapter Repository Slice

- Added `src/modules/courses/CourseClassRepository.ts`.
- Added `src/modules/courses/CourseChapterRepository.ts`.
- Added `tests/course-class-repository.test.ts`.
- Added `tests/course-chapter-repository.test.ts`.
- Moved Course class/chapter persistence boundaries out of `CourseService` for:
  - course menu class/chapter lookup;
  - delete-course class/chapter cascade lookup and deletion;
  - approval-time chapter content sync;
  - first template selection class/chapter lookup;
  - course submission readiness class lookup.
- Confirmed `CourseService` and `VMBoxService` no longer directly reference `CourseModel`, `UsersModel`, `ReviewsModel`, `ClassModel`, or `ChapterModel`.
- Verified:
  - `npm run typecheck`
  - `npm test` (`107` files, `541` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Config Execution Service Slice

- Added `src/modules/vm/VMConfigExecutionService.ts`.
- Added `tests/vm-config-execution-service.test.ts`.
- Moved VM clone/configuration and update-config execution orchestration out of `VMManageService` for:
  - clone task polling and task step completion/failure updates;
  - disk readiness polling before clone-finalization resize;
  - shared name/CPU/memory/disk/Cloud-Init operation execution;
  - update-config execution-plan step progression and Cloud-Init regeneration.
- Kept `VMManageService` focused on request validation, ownership/resource checks, task creation, and final persistence/resource accounting.
- `VMManageService.ts` is now about `922` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-config-execution-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`111` files, `563` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Resource Accounting Service Slice

- Added `src/modules/vm/VMResourceAccountingService.ts`.
- Added `tests/vm-resource-accounting-service.test.ts`.
- Moved VM resource accounting orchestration out of `VMManageService` for:
  - create-VM quota checks;
  - update-config quota checks;
  - used-resource increment updates after successful create/update;
  - resource reclaim updates after VM deletion.
- Kept existing response messages for missing compute plans, missing used-resource records, and quota violations.
- `VMManageService.ts` is now about `818` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-resource-accounting-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`112` files, `568` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Deletion Workflow Service Slice

- Added `src/modules/vm/VMDeletionWorkflowService.ts`.
- Added `tests/vm-deletion-workflow-service.test.ts`.
- Moved VM deletion execution out of `VMManageService` for:
  - stopped/running power-state enforcement before PVE deletion;
  - PVE delete API execution and user-safe API failure messages;
  - immediate and task-based deletion response handling;
  - resource reclaim after successful deletion;
  - VM record deletion and owner `owned_vms` cleanup.
- `VMManageService.deleteUserVM()` now keeps token role validation, actor lookup, ObjectId validation, ownership policy, and VM lookup before delegating execution.
- `VMManageService.ts` is now about `666` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-deletion-workflow-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`113` files, `572` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Workspace Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildWorkspaceService.ts`.
- Added `tests/ai-box-build-workspace-service.test.ts`.
- Moved AI Box Build workspace filesystem lifecycle out of `AIBoxBuildService` for:
  - opencode workspace creation and initial artifact file writes;
  - `build-context.json`, `AGENTS.md`, and `opencode.json` generation;
  - reference bundle path validation, size/file-count summarization, safe copy, and ignored-entry filtering;
  - workspace artifact refresh and job persistence update;
  - exact job workspace deletion checks and removal;
  - generated script validation and reference-backed fallback file writes.
- `AIBoxBuildService.ts` is now about `1017` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-workspace-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`114` files, `576` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Review Service Slice

- Added `src/modules/vm-box/VMBoxReviewService.ts`.
- Added `tests/vm-box-review-service.test.ts`.
- Moved VM Box review create/list/update/delete orchestration out of `VMBoxService` for:
  - review request validation;
  - public-box guard checks;
  - duplicate rating checks;
  - review document create/update/delete persistence;
  - box review ID maintenance and rating recalculation;
  - reviewer DTO assembly for review listing.
- `VMBoxService.ts` is now about `941` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-review-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`115` files, `580` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Writeup Service Slice

- Added `src/modules/vm-box/VMBoxWriteupService.ts`.
- Added `tests/vm-box-writeup-service.test.ts`.
- Moved VM Box writeup submit/list/review/visibility orchestration out of `VMBoxService` for:
  - writeup submission request validation and duplicate active-writeup guard;
  - public, personal, and moderator writeup listing filters;
  - moderator ownership checks for Admin-owned boxes and SuperAdmin access;
  - batched writeup DTO user/box/template lookup;
  - approve/reject mutation and visibility mutation workflows.
- `VMBoxService.ts` is now about `747` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-writeup-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`116` files, `584` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build SSH Execution Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildSSHExecutionService.ts`.
- Added `tests/ai-box-build-ssh-execution-service.test.ts`.
- Moved AI Box Build generated script SSH execution out of `AIBoxBuildService` for:
  - remote script directory creation;
  - optional reference bundle removal/upload;
  - generated script upload;
  - root and sudo execution handling;
  - command result summary logging and stable upload/preparation errors.
- `AIBoxBuildService.ts` is now about `979` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-ssh-execution-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`117` files, `587` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Provisioning Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildProvisioningService.ts`.
- Added `tests/ai-box-build-provisioning-service.test.ts`.
- Moved AI Box Build VM provisioning and boot orchestration out of `AIBoxBuildService` for:
  - VM creation request forwarding through `VMManageService`;
  - VM record wait and persistence update;
  - optional cloud-init network config preparation and regeneration;
  - VM boot task handling and stable boot errors;
  - optional guest network identity normalization;
  - QEMU guest-agent IP polling, preferred-IP selection, wait logs, and timeout errors.
- `AIBoxBuildService.ts` is now about `796` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-provisioning-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`118` files, `590` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Review Service Slice

- Added `src/modules/courses/CourseReviewService.ts`.
- Added `tests/course-review-service.test.ts`.
- Moved Course review workflow orchestration out of `CourseService` for:
  - review creation permission checks, duplicate guard, review persistence, and rating recalculation;
  - review listing access checks and batched reviewer DTO assembly;
  - review update ownership checks and rating recalculation;
  - review delete ownership checks, review ID removal, and rating recalculation.
- `CourseService.ts` is now about `808` lines after the extraction.
- Verified:
  - `npm test -- tests/course-review-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`119` files, `594` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Lifecycle Service Slice

- Added `src/modules/courses/CourseLifecycleService.ts`.
- Added `tests/course-lifecycle-service.test.ts`.
- Moved Course lifecycle/status orchestration out of `CourseService` for:
  - submitted-course approval with approved chapter-content sync;
  - submitted-course rejection;
  - owner-only course submission readiness checks;
  - owner-only public/unpublic visibility transitions.
- `CourseService.ts` is now about `706` lines after the extraction.
- Verified:
  - `npm test -- tests/course-lifecycle-service.test.ts tests/course-review-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`120` files, `598` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Agent Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildAgentService.ts`.
- Added `tests/ai-box-build-agent-service.test.ts`.
- Moved AI Box Build agent/model orchestration out of `AIBoxBuildService` for:
  - initial combined generation and split-artifact fallback;
  - model candidate retry with stable failure aggregation;
  - iteration generation and split fallback;
  - targeted artifact repair selection and execution;
  - JSON chat completion normalization and parsed-response model attribution.
- `AIBoxBuildService.ts` is now about `656` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-agent-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`121` files, `601` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Preflight Service Slice

- Added `src/modules/guacamole/GuacamoleConnectionPreflightService.ts`.
- Added `tests/guacamole-connection-preflight-service.test.ts`.
- Moved shared Guacamole SSH/RDP/VNC preflight orchestration out of `GuacamoleService` for:
  - VM ownership/SuperAdmin permission checks;
  - VM running-state validation;
  - guest-agent network lookup and requested-IP selection;
  - target service connectivity checks;
  - VM display-name fallback;
  - Guacamole auth-token dependency and data-source fallback.
- `GuacamoleService.ts` is now about `560` lines after the extraction.
- Verified:
  - `npm test -- tests/guacamole-connection-preflight-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`122` files, `604` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Answer Service Slice

- Added `src/modules/vm-box/VMBoxAnswerService.ts`.
- Added `tests/vm-box-answer-service.test.ts`.
- Moved VM Box answer workflow orchestration out of `VMBoxService` for:
  - answer-record query validation and VM owner/box access checks;
  - box flag lookup and answer-status DTO assembly;
  - flag submission validation/evaluation;
  - idempotent already-correct handling;
  - dynamic answer-record field persistence with `set()`/`markModified()` support.
- `VMBoxService.ts` is now about `674` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-answer-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`123` files, `608` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course List Service Slice

- Added `src/modules/courses/CourseListService.ts`.
- Added `tests/course-list-service.test.ts`.
- Moved Course list/catalog workflow orchestration out of `CourseService` for:
  - public course listing;
  - SuperAdmin all-course listing;
  - SuperAdmin submitted-course listing;
  - batched submitter lookup and missing-submitter omission handling.
- `CourseService.ts` is now about `668` lines after the extraction.
- Verified:
  - `npm test -- tests/course-list-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`124` files, `612` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box List Service Slice

- Added `src/modules/vm-box/VMBoxListService.ts`.
- Added `tests/vm-box-list-service.test.ts`.
- Moved VM Box listing orchestration out of `VMBoxService` for:
  - SuperAdmin submitted-box listing with published-box lookup;
  - public-box listing with public writeup counts;
  - SuperAdmin pending-box listing;
  - batched submitter/template lookup and shared template-info resolver usage.
- `VMBoxService.ts` is now about `574` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-list-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`125` files, `616` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Creation Workflow Service Slice

- Added `src/modules/vm/VMCreationWorkflowService.ts`.
- Added `tests/vm-creation-workflow-service.test.ts`.
- Moved VM clone/config/register orchestration out of `VMManageService` for:
  - old task retention cleanup;
  - VM creation task creation and task-status transitions;
  - orphan cloud-init disk cleanup;
  - PVE clone invocation and clone failure response;
  - cloned VM configuration execution;
  - resource usage increment and user-owned VM record creation;
  - optional box VM marking;
  - failed configuration cleanup of PVE VM, VM record, owner link, and task state.
- `VMManageService.ts` is now about `483` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-creation-workflow-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`126` files, `619` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat VM Management Service Slice

- Added `src/modules/ai-chat/AIChatVMManagementService.ts`.
- Added `tests/ai-chat-vm-management-service.test.ts`.
- Moved AI Chat VM-management orchestration out of `AIChatService` for:
  - admin-user VM inventory loading;
  - VM command classification with deterministic fallback;
  - target resolution and list/help responses;
  - mutating-action pending confirmation lifecycle;
  - confirmed VM action execution through VM service boundaries.
- Kept pending VM actions injectable so a short-lived persistence layer can replace the in-memory map if multi-process deployment needs it.
- `AIChatService.ts` is now about `364` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-chat-vm-management-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`127` files, `623` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Membership Service Slice

- Added `src/modules/courses/CourseMembershipService.ts`.
- Added `tests/course-membership-service.test.ts`.
- Moved Course membership and invitation orchestration out of `CourseService` for:
  - public-course join access checks;
  - joined course ID updates;
  - invitation request validation and owner authorization;
  - batched invited-user lookup and recipient filtering;
  - injectable invitation sending for testable mail boundaries.
- `CourseService.ts` is now about `624` lines after the extraction.
- Verified:
  - `npm test -- tests/course-membership-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`128` files, `627` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Mutation Service Slice

- Added `src/modules/courses/CourseMutationService.ts`.
- Added `tests/course-mutation-service.test.ts`.
- Moved Course create/update/delete orchestration out of `CourseService` for:
  - create request validation, duplicate-name guard, persistence, and submitter membership association;
  - rollback when submitter course-ID association fails;
  - owner-only update checks and update payload application;
  - course delete cascade over classes, chapters, joined-user course IDs, and the course document.
- `CourseService.ts` is now about `516` lines after the extraction.
- Verified:
  - `npm test -- tests/course-mutation-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`129` files, `632` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Job Management Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildJobManagementService.ts`.
- Added `tests/ai-box-build-job-management-service.test.ts`.
- Moved AI Box Build list/get/delete/update-status API orchestration out of `AIBoxBuildService` for:
  - admin vs SuperAdmin job list scoping;
  - stale execution job marking before list/get;
  - job access checks and stable 403/404 responses;
  - delete preconditions, workspace deletion, and delete response DTO;
  - status update validation and blocked-validation approval guard.
- `AIBoxBuildService.ts` is now about `605` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-job-management-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`130` files, `637` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 PVE Task Service Slice

- Added `src/modules/pve/PVETaskService.ts`.
- Added `tests/pve-task-service.test.ts`.
- Expanded `src/modules/vm/VMTaskRepository.ts` and `tests/vm-task-repository.test.ts`.
- Moved VM task status/list/refresh/cleanup orchestration out of `PVEService` for:
  - multi-task status lookup scoped to the requesting user;
  - latest-task and paginated task listing with optional status filter;
  - live PVE UPID status projection;
  - refresh-and-persist of local VM task state from PVE task status;
  - old-task cleanup plus post-cleanup count/status summary.
- `PVEService.ts` is now about `374` lines after the extraction.
- Verified:
  - `npm test -- tests/pve-task-service.test.ts tests/vm-task-repository.test.ts`
  - `npm run typecheck`
  - `npm test` (`131` files, `645` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Draft Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildDraftService.ts`.
- Added `tests/ai-box-build-draft-service.test.ts`.
- Moved AI Box Build draft create/update orchestration out of `AIBoxBuildService` for:
  - direction/message validation;
  - initial agent draft generation and failure fallback draft persistence;
  - user message agent update flow;
  - artifact normalization, validation report merge, and history message persistence;
  - job access checks for draft updates.
- `AIBoxBuildService.ts` is now about `511` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-draft-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`132` files, `649` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Deletion Service Slice

- Added `src/modules/templates/TemplateDeletionService.ts`.
- Added `tests/template-deletion-service.test.ts`.
- Moved Template deletion orchestration out of `TemplateManageService` for:
  - template ID validation and owner/SuperAdmin permission checks;
  - PVE config lookup for resource reclaim;
  - PVE template deletion and optional task wait;
  - best-effort resource reclaim that does not block DB cleanup;
  - owner `owned_templates` cleanup and template document deletion.
- `TemplateManageService.ts` is now about `468` lines after the extraction.
- Verified:
  - `npm test -- tests/template-deletion-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`133` files, `653` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box AI Assistant Service Slice

- Added `src/modules/vm-box/VMBoxAiAssistantService.ts`.
- Added `tests/vm-box-ai-assistant-service.test.ts`.
- Moved VM Box AI assistant setting orchestration out of `VMBoxService` for:
  - box/submission request validation and owner/SuperAdmin permission checks;
  - published-box setting updates;
  - linked submitted-box setting synchronization;
  - approved submitted-box updates and published-box backfill linkage;
  - pending submitted-box updates without published-box lookup.
- `VMBoxService.ts` is now about `517` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-ai-assistant-service.test.ts tests/vm-box-ai-assistant-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`134` files, `657` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Connection Establishment Service Slice

- Added `src/modules/guacamole/GuacamoleConnectionEstablishmentService.ts`.
- Added `tests/guacamole-connection-establishment-service.test.ts`.
- Moved Guacamole SSH/RDP/VNC connection establishment orchestration out of `GuacamoleService` for:
  - configuration availability checks;
  - user permission validation delegation;
  - target VM/port validation;
  - shared preflight invocation;
  - protocol-specific connection profile construction;
  - get-or-create config finalization, direct URL DTO assembly, and established-connection response messages.
- `GuacamoleService.ts` is now about `293` lines after the extraction.
- Verified:
  - `npm test -- tests/guacamole-connection-establishment-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`135` files, `661` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Audit Service Slice

- Added `src/modules/templates/TemplateAuditService.ts`.
- Added `tests/template-audit-service.test.ts`.
- Moved submitted-template audit orchestration out of `TemplateService` for:
  - audit request validation and submitted-template status/reject-reason updates;
  - submitted template and QEMU lookup;
  - approval clone naming, PVE clone execution, optional task wait, and no-UPID verification;
  - public approved-template persistence and SuperAdmin ownership update;
  - approval/rejection email notification dispatch.
- `TemplateService.ts` is now about `367` lines after the extraction.
- Verified:
  - `npm test -- tests/template-audit-service.test.ts tests/template-submission-audit-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`136` files, `667` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Submission Audit Service Slice

- Added `src/modules/vm-box/VMBoxSubmissionAuditService.ts`.
- Added `tests/vm-box-submission-audit-service.test.ts`.
- Moved VM Box submitted-box audit orchestration out of `VMBoxService` for:
  - audit request validation and submitted-box status/reject-reason updates;
  - template and QEMU lookup;
  - approved public VM box creation;
  - approval/rejection email notification dispatch with non-blocking email failures.
- `VMBoxService.ts` is now about `438` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-submission-audit-service.test.ts tests/vm-box-submission-audit-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`137` files, `672` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Course Read Service Slice

- Added `src/modules/courses/CourseReadService.ts`.
- Added `tests/course-read-service.test.ts`.
- Moved Course page/menu/first-template read orchestration out of `CourseService` for:
  - course ID validation and joined-course authorization;
  - course page submitter lookup and unauthorized response body preservation;
  - course menu class/chapter lookup and DTO assembly;
  - first-template access checks and ordered class/chapter template selection.
- `CourseService.ts` is now about `401` lines after the extraction.
- Verified:
  - `npm test -- tests/course-read-service.test.ts tests/course-page-dto-factory.test.ts tests/course-menu-dto-factory.test.ts tests/course-access-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`138` files, `679` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Clone Service Slice

- Added `src/modules/templates/TemplateCloneService.ts`.
- Added `tests/template-clone-service.test.ts`.
- Moved Template clone orchestration out of `TemplateManageService` for:
  - request validation, source template lookup, clone name sanitization, and next VMID lookup;
  - clone task creation and step progress updates;
  - PVE clone execution, optional clone wait, convert-to-template execution, optional conversion wait;
  - failed-conversion cleanup of cloned VM;
  - cloned template persistence, owner `owned_templates` update, and final task completion.
- `TemplateManageService.ts` is now about `179` lines after the extraction.
- Verified:
  - `npm test -- tests/template-clone-service.test.ts tests/template-deletion-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`139` files, `684` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Runtime Preflight Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildRuntimePreflightService.ts`.
- Added `tests/ai-box-build-runtime-preflight-service.test.ts`.
- Moved AI Box Build runtime preflight command orchestration out of `AIBoxBuildService` for:
  - OpenAI runtime config validation;
  - `opencode --version` command check with autoupdate disabled;
  - conditional `sshpass -V` check for non-dry runs;
  - aggregation of command/config failures into the existing user-safe preflight message.
- `AIBoxBuildService.ts` is now about `470` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-runtime-preflight-service.test.ts tests/ai-box-build-runtime-preflight-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`140` files, `687` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Run Execution Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildRunExecutionService.ts`.
- Added `tests/ai-box-build-run-execution-service.test.ts`.
- Moved AI Box Build background run execution orchestration out of `AIBoxBuildService` for:
  - dry-run and real-run execution worker startup logging;
  - VM provisioning delegation and dry-run skip logging;
  - OpenCode workspace preparation and setup/validation script generation;
  - reference fallback file generation on OpenCode/script readiness failure;
  - SSH setup/validation script execution for real runs;
  - run completion persistence and failure persistence.
- `AIBoxBuildService.ts` is now about `269` lines after the extraction.
- Verified:
  - `npm test -- tests/ai-box-build-run-execution-service.test.ts tests/ai-box-build-runtime-preflight-service.test.ts tests/ai-box-build-execution-policy.test.ts tests/ai-box-build-opencode-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`141` files, `691` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Config Update Workflow Service Slice

- Added `src/modules/vm/VMConfigUpdateWorkflowService.ts`.
- Added `tests/vm-config-update-workflow-service.test.ts`.
- Moved VM config update orchestration out of `VMManageService` for:
  - VM ID and config update request validation;
  - VM ownership, VM lookup, current config lookup, and stopped-state precondition;
  - resource delta calculation and update quota checks;
  - update-task creation and task status persistence;
  - shared config execution service invocation;
  - resource usage increment and stable success/failure responses.
- `VMManageService.ts` is now about `323` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-config-update-workflow-service.test.ts tests/vm-config-update-policy.test.ts tests/vm-config-execution-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`142` files, `696` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Submission Create Service Slice

- Added `src/modules/vm-box/VMBoxSubmissionCreateService.ts`.
- Added `tests/vm-box-submission-create-service.test.ts`.
- Moved VM Box submission create orchestration out of `VMBoxService` for:
  - create request validation and sanitization;
  - template existence lookup;
  - submitted-box document creation and save;
  - stable submitted-box create response payload.
- `VMBoxService.ts` is now about `411` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-submission-create-service.test.ts tests/vm-box-submission-create-policy.test.ts tests/vm-box-submission-repository.test.ts`
  - `npm run typecheck`
  - `npm test` (`143` files, `699` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Auth Login Service Slice

- Added `src/modules/auth/AuthLoginService.ts`.
- Added `tests/auth-login-service.test.ts`.
- Moved Auth login orchestration out of `AuthService` for:
  - missing-field and invalid-email response behavior;
  - unverified-email verification resend throttling;
  - wrong-password attempt creation and lockout checks;
  - successful login cleanup of wrong-attempt state;
  - token generation response.
- Removed the now-unused duplicate wrong-login helper from `AuthService`; `AuthLoginService` is the single owner of login lockout behavior.
- `AuthService.ts` is now about `237` lines after the extraction and cleanup.
- Verified:
  - `npm test -- tests/auth-login-service.test.ts tests/auth-registration-policy.test.ts tests/auth-token-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`144` files, `705` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Box Template Info Service Slice

- Added `src/modules/vm-box/VMBoxTemplateInfoService.ts`.
- Added `tests/vm-box-template-info-service.test.ts`.
- Moved VM Box template-info PVE config lookup and fallback behavior out of `VMBoxService` for:
  - missing-template default DTO creation;
  - successful QEMU config projection through the existing VM Box list DTO factory;
  - non-200 PVE config fallback to stable defaults;
  - thrown PVE lookup fallback with optional template-owner preservation.
- `VMBoxService.ts` is now about `368` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-box-template-info-service.test.ts tests/vm-box-list-service.test.ts tests/vm-box-list-dto-factory.test.ts`
  - `npm run typecheck`
  - `npm test` (`145` files, `709` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Conversion Service Slice

- Added `src/modules/templates/TemplateConversionService.ts`.
- Added `tests/template-conversion-service.test.ts`.
- Moved VM-to-template conversion orchestration out of `TemplateService` for:
  - required-field and VM ObjectId validation;
  - CI credential validation delegation;
  - owned-VM lookup and private source-template permission checks;
  - stopped-state precondition and optional template-name sanitization;
  - PVE conversion execution, task wait handling, template persistence, user ownership update, and VM record cleanup.
- `TemplateService.ts` is now about `249` lines after the extraction.
- Verified:
  - `npm test -- tests/template-conversion-service.test.ts tests/template-clone-service.test.ts tests/template-audit-service.test.ts tests/template-deletion-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`146` files, `718` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Submission Create Service Slice

- Added `src/modules/templates/TemplateSubmissionCreateService.ts`.
- Added `tests/template-submission-create-service.test.ts`.
- Moved Template submission create orchestration out of `TemplateService` for:
  - submitted template ID validation;
  - template existence lookup;
  - pending submitted-template persistence payload;
  - stable submit response shape.
- `TemplateService.ts` is now about `232` lines after the extraction.
- Verified:
  - `npm test -- tests/template-submission-create-service.test.ts tests/template-conversion-service.test.ts tests/template-audit-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`147` files, `721` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Template Config Update Service Slice

- Added `src/modules/templates/TemplateConfigUpdateService.ts`.
- Added `tests/template-config-update-service.test.ts`.
- Moved Template config update orchestration out of `TemplateManageService` for:
  - template ID validation and template lookup;
  - owner/SuperAdmin update permission checks;
  - SuperAdmin-only `is_public` mutation;
  - PVE template-name update and task wait;
  - PVE Cloud-Init update and task wait before DB persistence;
  - stable failure behavior that avoids partial DB updates when PVE operations fail.
- `TemplateManageService.ts` is now about `76` lines after the extraction.
- Verified:
  - `npm test -- tests/template-config-update-service.test.ts tests/template-clone-service.test.ts tests/template-deletion-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`148` files, `730` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Class Management Service Slice

- Added `src/modules/courses/ClassManagementService.ts`.
- Added `tests/class-management-service.test.ts`.
- Moved Class read/update/delete/create orchestration out of `ClassService` for:
  - class/course ID validation and lookup;
  - course owner authorization checks;
  - class content validation reuse;
  - duplicate class-name and class-order checks;
  - class create plus course class-list attachment;
  - class delete plus course detachment and child chapter cleanup.
- `ClassService.ts` is now about `78` lines after the extraction.
- Verified:
  - `npm test -- tests/class-management-service.test.ts tests/class-content-policy.test.ts tests/course-class-repository.test.ts`
  - `npm run typecheck`
  - `npm test` (`149` files, `738` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Chapter Management Service Slice

- Added `src/modules/courses/ChapterManagementService.ts`.
- Added `tests/chapter-management-service.test.ts`.
- Moved Chapter read/update/delete/create orchestration out of `ChapterService` for:
  - chapter/class ID validation and lookup;
  - joined-course/SuperAdmin read authorization;
  - course owner authorization for mutations;
  - chapter content validation reuse;
  - duplicate chapter-name and chapter-order checks;
  - chapter create plus class chapter-list attachment;
  - chapter delete plus class detachment.
- `ChapterService.ts` is now about `96` lines after the extraction.
- Verified:
  - `npm test -- tests/chapter-management-service.test.ts tests/chapter-content-policy.test.ts tests/course-chapter-repository.test.ts`
  - `npm run typecheck`
  - `npm test` (`150` files, `746` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 User Profile Service Slice

- Added `src/modules/users/UserProfileService.ts`.
- Added `tests/user-profile-service.test.ts`.
- Moved user profile/password/avatar orchestration out of `UserService` for:
  - verified-user profile retrieval with default avatar fallback;
  - username update with duplicate-name lookup;
  - password change required-field, confirmation, old-password, strength, and hash/save flow;
  - avatar upload with old-avatar cleanup and injected image processing;
  - custom avatar delete with default-avatar restoration.
- `UserService.ts` is now about `258` lines after the extraction.
- Verified:
  - `npm test -- tests/user-profile-service.test.ts tests/user-lookup-policy.test.ts tests/user-repository.test.ts`
  - `npm run typecheck`
  - `npm test` (`151` files, `757` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Read Service Slice

- Added `src/modules/vm/VMReadService.ts`.
- Added `tests/vm-read-service.test.ts`.
- Moved VM list/status/network read orchestration out of `VMService` for:
  - user-owned VM list loading and per-VM config/status DTO assembly;
  - SuperAdmin all-VM listing with batched owner-name lookup;
  - VM status lookup authorization plus running-VM resource usage attachment;
  - VM network lookup authorization, running-state precondition, and simplified interface DTO assembly;
  - stable list fallback DTOs when PVE config/status reads fail.
- `VMService.ts` is now about `113` lines after the extraction.
- Verified:
  - `npm test -- tests/vm-read-service.test.ts tests/vm-list-dto-factory.test.ts tests/vm-operation-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`152` files, `765` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 User Read Service Slice

- Added `src/modules/users/UserReadService.ts`.
- Added `tests/user-read-service.test.ts`.
- Moved remaining User read orchestration out of `UserService` for:
  - joined-course lookup and `CourseInfo` DTO assembly;
  - user compute-resource-plan lookup;
  - SuperAdmin target-user profile lookup with target ID validation;
  - unverified-actor guard behavior for courses, CRP, and target-user lookup.
- `UserService.ts` is now about `202` lines after the extraction.
- Verified:
  - `npm test -- tests/user-read-service.test.ts tests/user-profile-service.test.ts tests/user-lookup-policy.test.ts tests/user-repository.test.ts`
  - `npm run typecheck`
  - `npm test` (`153` files, `773` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 PVE QEMU Config Access Service Slice

- Added `src/modules/pve/PVEQemuConfigAccessService.ts`.
- Added `tests/pve-qemu-config-access-service.test.ts`.
- Moved QEMU config access orchestration out of `PVEService` for:
  - VM ObjectId validation;
  - user/admin ownership checks before DB/PVE access;
  - SuperAdmin all-VM access;
  - VM lookup and PVE QEMU config loading;
  - role-specific PVE token modes and response DTO shape;
  - QEMU-not-found and PVE-failure response behavior.
- `PVEService.ts` is now about `271` lines after the extraction.
- Verified:
  - `npx vitest run tests/pve-qemu-config-access-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`154` files, `781` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Chat Box Hint Service Slice

- Added `src/modules/ai-chat/AIChatBoxHintService.ts`.
- Added `tests/ai-chat-box-hint-service.test.ts`.
- Moved Box hint orchestration out of `AIChatService` for:
  - hint request validation and prompt-injection input sanitization;
  - VM lookup and owner/SuperAdmin access checks;
  - Box association and AI-assistant-enabled checks;
  - Box hint context selection from design/setup descriptions;
  - shared OpenAI request assembly for stream and non-stream hint flows;
  - stream-compatible JSON error payloads and non-stream fallback hint responses.
- `AIChatService.ts` is now about `239` lines after the extraction.
- Verified:
  - `npx vitest run tests/ai-chat-box-hint-service.test.ts tests/ai-chat-request-policy.test.ts tests/ai-chat-language-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`155` files, `790` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Guacamole Disconnect Service Slice

- Added `src/modules/guacamole/GuacamoleDisconnectService.ts`.
- Added `tests/guacamole-disconnect-service.test.ts`.
- Moved Guacamole disconnect orchestration out of `GuacamoleService` for:
  - Guacamole service configuration guard;
  - local connection ID and active Guacamole connection ID validation;
  - user-token acquisition through the Guacamole auth service;
  - active connection kill calls through the Guacamole API client;
  - disconnect success payload assembly;
  - auth/API failure response behavior.
- `GuacamoleService.ts` is now about `246` lines after the extraction.
- Verified:
  - `npx vitest run tests/guacamole-disconnect-service.test.ts tests/guacamole-connection-lifecycle-policy.test.ts tests/guacamole-connection-request-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`156` files, `797` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 VM Creation Request Service Slice

- Added `src/modules/vm/VMCreationRequestService.ts`.
- Added `tests/vm-creation-request-service.test.ts`.
- Moved VM creation request orchestration out of `VMManageService` for:
  - template/box ObjectId validation;
  - VM creation payload validation;
  - next PVE VM ID lookup and VM name identity policy;
  - template and box source lookup;
  - template QEMU info preflight;
  - Cloud-Init credential selection for template-based VM creation;
  - create-limit checks before clone/config workflow execution;
  - forwarding normalized template/box creation payloads into the shared VM creation workflow.
- `VMManageService.ts` is now about `140` lines after the extraction.
- Verified:
  - `npx vitest run tests/vm-creation-request-service.test.ts tests/vm-creation-request-policy.test.ts tests/vm-cloud-init-policy.test.ts tests/vm-creation-workflow-service.test.ts`
  - `npm run typecheck`
  - `npm test` (`157` files, `805` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 AI Box Build Run Launch Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildRunLaunchService.ts`.
- Added `tests/ai-box-build-run-launch-service.test.ts`.
- Moved AI Box Build run launch orchestration out of `AIBoxBuildService` for:
  - job ID validation;
  - stale active-run cleanup before run start;
  - job lookup and requester/SuperAdmin access checks;
  - run request validation with blocked target-node policy;
  - artifact normalization and validation-blocked persistence;
  - runtime preflight guard;
  - start-state conflict checks and atomic queue update;
  - background run execution dispatch and running-job set cleanup.
- `AIBoxBuildService.ts` is now about `126` lines after the extraction.
- Verified:
  - `npx vitest run tests/ai-box-build-run-launch-service.test.ts tests/ai-box-build-run-policy.test.ts tests/ai-box-build-execution-policy.test.ts tests/ai-box-build-stale-job-policy.test.ts tests/ai-box-build-validation-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`158` files, `812` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 PVE Datacenter Status Service Slice

- Added `src/modules/pve/PVEDatacenterStatusService.ts`.
- Added `tests/pve-datacenter-status-service.test.ts`.
- Moved PVE datacenter status aggregation out of `PVEService` for:
  - node list loading and missing-node response behavior;
  - online/offline node counting and node DTO projection;
  - datacenter CPU, memory, and base disk aggregation;
  - shared storage de-duplication by storage ID using max observed capacity/usage;
  - extra local `zfspool`/`lvmthin` storage aggregation without double-counting `local`;
  - per-node storage API failure tolerance while preserving node overview responses.
- `PVEService.ts` is now about `177` lines after the extraction.
- Verified:
  - `npx vitest run tests/pve-datacenter-status-service.test.ts tests/pve-datacenter-status-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`159` files, `816` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Compute Resource Plan Management Service Slice

- Added `src/modules/crp/ComputeResourcePlanManagementService.ts`.
- Added `tests/compute-resource-plan-management-service.test.ts`.
- Moved Compute Resource Plan management orchestration out of `SuperAdminCRPService` for:
  - create payload validation and duplicate-name checks;
  - update ID validation and partial payload validation;
  - delete ID validation and not-found handling;
  - list-all and get-by-ID repository access;
  - stable create/update/delete/list/get response messages and error behavior.
- `SuperAdminCRPService.ts` is now about `98` lines after the extraction.
- Verified:
  - `npx vitest run tests/compute-resource-plan-management-service.test.ts tests/compute-resource-plan-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`160` files, `824` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 SuperAdmin User Management Service Slice

- Added `src/modules/super-admin/SuperAdminUserManagementService.ts`.
- Added `tests/super-admin-user-management-service.test.ts`.
- Moved SuperAdmin user management orchestration out of `SuperAdminService` for:
  - user ID and assignable-role validation before role mutation;
  - superadmin target-role protection;
  - CRP assignment ID validation, target-user lookup, and plan lookup;
  - assigned-plan persistence and response DTO assembly;
  - verified-actor checks for user/admin listing;
  - empty-list and repository error response behavior.
- `SuperAdminService.ts` is now about `78` lines after the extraction.
- Verified:
  - `npx vitest run tests/super-admin-user-management-service.test.ts tests/super-admin-user-mutation-policy.test.ts`
  - `npm run typecheck`
  - `npm test` (`161` files, `831` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)

### 2026-05-26 Auth Registration Service Slice

- Added `src/modules/auth/AuthRegistrationService.ts`.
- Added `tests/auth-registration-service.test.ts`.
- Moved registration orchestration out of `AuthService` for:
  - missing-field validation and response message ordering;
  - batched username/email conflict lookup and existing-account classification;
  - password strength, hashing, and default standard compute-resource-plan assignment;
  - user creation persistence payload assembly;
  - verification token generation, email send throttling, and resend-boundary behavior;
  - dependency-injected repository, password, token, mail, and clock boundaries for focused tests.
- `AuthService.ts` is now about `143` lines after the extraction.
- Verified:
  - `npx vitest run tests/auth-registration-service.test.ts tests/auth-registration-policy.test.ts tests/auth-login-service.test.ts` (`3` files, `18` tests)
  - `npm run typecheck`
  - `npm test` (`162` files, `839` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Auth Forgot Password Service Slice

- Added `src/modules/auth/AuthForgotPasswordService.ts`.
- Added `tests/auth-forgot-password-service.test.ts`.
- Moved forgot-password orchestration out of `AuthService` for:
  - POST missing-email and unknown-email privacy response behavior;
  - reset-token generation and reset email send throttling;
  - PUT authorization header and reset-token validation;
  - reset password required-field and strength validation;
  - password hashing, persistence, and stable success response;
  - invalid method response behavior.
- `AuthService.ts` is now about `86` lines after the extraction.
- Verified:
  - `npx vitest run tests/auth-forgot-password-service.test.ts tests/auth-login-service.test.ts tests/auth-registration-service.test.ts tests/auth-token-policy.test.ts` (`4` files, `25` tests)
  - `npm run typecheck`
  - `npm test` (`163` files, `848` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Course Request Adapter Service Slice

- Added `src/modules/courses/CourseRequestAdapterService.ts`.
- Added `tests/course-request-adapter-service.test.ts`.
- Moved remaining Course route-to-workflow adapter logic out of `CourseService` for:
  - route/body course ID validation before mutation/lifecycle workflows;
  - read/menu/first-template DTO forwarding;
  - create/update/delete, join/invite, review, list, approve/unapprove, submit, and visibility workflow calls.
- `CourseService.ts` is now about `160` lines and acts as an auth/error wrapper.
- Verified:
  - `npx vitest run tests/course-request-adapter-service.test.ts tests/course-read-service.test.ts tests/course-list-service.test.ts tests/course-mutation-service.test.ts tests/course-membership-service.test.ts tests/course-review-service.test.ts tests/course-lifecycle-service.test.ts` (`7` files, `30` tests)
  - `npm run typecheck`
  - `npm test` (`166` files, `857` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 VM Box Request Adapter Service Slice

- Added `src/modules/vm-box/VMBoxRequestAdapterService.ts`.
- Moved remaining VM Box route-to-workflow adapter logic out of `VMBoxService` for:
  - submission create/audit, public/submitted/pending lists, AI assistant setting, reviews, writeups, and answer records;
  - route param/query/body normalization for review and writeup IDs;
  - public unauthenticated list/read flows through the same DTO adapter boundary.
- `VMBoxService.ts` is now about `190` lines and acts as an auth/error wrapper.
- Verified:
  - `npx vitest run tests/vm-box-list-service.test.ts tests/vm-box-review-service.test.ts tests/vm-box-writeup-service.test.ts tests/vm-box-answer-service.test.ts tests/vm-box-submission-create-service.test.ts tests/vm-box-submission-audit-service.test.ts` (covered again inside the `9` file targeted VM Box/Guacamole run)
  - `npm run typecheck`
  - `npm test` (`164` files, `850` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Guacamole Connection Request Boundary Slice

- Updated `src/modules/guacamole/GuacamoleConnectionEstablishmentService.ts`.
- Updated `src/modules/guacamole/GuacamoleConnectionPreflightService.ts`.
- Updated `src/service/GuacamoleService.ts`.
- Updated Guacamole connection establishment/preflight tests.
- Removed raw Express `Request` from Guacamole connection establishment and preflight modules by:
  - validating the actor once in `GuacamoleService`;
  - passing `{ request, user, isSuperAdmin }` into SSH/RDP/VNC establishment;
  - passing the authenticated user into preflight token acquisition.
- Verified:
  - `npx vitest run tests/guacamole-connection-establishment-service.test.ts tests/guacamole-connection-preflight-service.test.ts tests/guacamole-connection-request-policy.test.ts` (`3` files, `13` tests)
  - `npm run typecheck`
  - `npm test` (`164` files, `850` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 AI Chat VM Action Request Boundary Slice

- Updated `src/modules/ai-chat/AIChatVMManagementService.ts`.
- Updated `src/service/AIChatService.ts`.
- Added DTO entry points in `src/service/VMOperateService.ts` and `src/service/VMManageService.ts` for AI Chat VM execution.
- Updated AI Chat VM management tests.
- Removed raw Express `Request` and request cloning from AI Chat VM management by:
  - passing `{ body, user, isSuperAdmin }` from `AIChatService`;
  - calling `VMReadService.getVMStatus/getVMNetworkInfo` directly for read actions;
  - calling `VMOperateService.executeVMOperation` for boot/shutdown/poweroff/reboot/reset;
  - calling `VMManageService.deleteUserVMForUser` for delete.
- Verified:
  - `npx vitest run tests/ai-chat-vm-management-service.test.ts tests/ai-chat-vm-intent-policy.test.ts tests/ai-chat-vm-pending-action-policy.test.ts tests/ai-chat-vm-response-policy.test.ts tests/ai-chat-request-policy.test.ts` (`5` files, `26` tests)
  - `npm run typecheck`
  - `npm test` (`164` files, `850` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 AI Box Build Provisioning Request Boundary Slice

- Updated `src/modules/ai-box-build/AIBoxBuildProvisioningService.ts`.
- Updated `src/modules/ai-box-build/AIBoxBuildRunExecutionService.ts`.
- Updated `src/modules/ai-box-build/AIBoxBuildRunLaunchService.ts`.
- Updated AI Box provisioning tests.
- Removed synthetic Express request construction from AI Box Build provisioning by:
  - passing the full user snapshot from run launch into run execution/provisioning;
  - calling `VMCreationRequestService.createFromTemplate({ user, body })` directly;
  - keeping the existing VM record wait, Cloud-Init preparation, boot, network normalization, and IP detection flow.
- Verified:
  - `npx vitest run tests/ai-box-build-provisioning-service.test.ts tests/ai-box-build-run-execution-service.test.ts tests/ai-box-build-run-launch-service.test.ts tests/vm-creation-request-service.test.ts` (`4` files, `22` tests)
  - `npm run typecheck`
  - `npm test` (`164` files, `850` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Template List Service Slice

- Added `src/modules/templates/TemplateListService.ts`.
- Added `tests/template-list-service.test.ts`.
- Moved template list orchestration out of `TemplateService` for:
  - all-template and accessible-template list retrieval;
  - submitter user batching;
  - PVE template config lookup and DTO assembly;
  - submitted-template list batching, missing-template tolerance, and stable response messages.
- `TemplateService.ts` is now about `117` lines after the extraction.
- Verified:
  - `npx vitest run tests/template-list-service.test.ts` (`1` file, `4` tests)
  - `npm run typecheck`
  - `npm test` (`166` files, `857` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 User Service Facade Cleanup Slice

- Updated `src/service/UserService.ts`.
- Consolidated repeated token validation and error handling through shared private wrappers.
- Kept profile/read workflow behavior delegated to `UserProfileService` and `UserReadService`.
- `UserService.ts` is now about `118` lines after the cleanup.
- Verified with the same full gate from this local batch:
  - `npm run typecheck`
  - `npm test` (`166` files, `857` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Guacamole and VM Service Facade Cleanup Slice

- Updated `src/service/GuacamoleService.ts`.
- Updated `src/service/VMService.ts`.
- Consolidated Guacamole SSH/RDP/VNC establishment into one service-level adapter helper.
- Consolidated repeated VM status/network SuperAdmin-or-user actor resolution into one helper.
- `GuacamoleService.ts` is now about `226` lines after cleanup.
- `VMService.ts` is now about `92` lines after cleanup.
- Verified with the same full gate from this local batch:
  - `npm run typecheck`
  - `npm test` (`166` files, `857` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Data Hardening Unique Constraint Preflight Slice

- Added `docs/DATA_HARDENING_UNIQUE_CONSTRAINTS.md`.
- Added `src/modules/data-hardening/UniqueConstraintDuplicateCheck.ts`.
- Added `src/scripts/checkUniqueConstraintDuplicates.ts`.
- Added `tests/unique-constraint-duplicate-check.test.ts`.
- Added `npm run data:check-unique-duplicates`.
- Documented duplicate checks and cleanup sequencing before adding deferred unique indexes for:
  - `users.email`;
  - `users.username`;
  - `compute_resource_plans.name`;
  - `vms.{pve_node,pve_vmid}`;
  - `vm_tasks.task_id`.
- The command is read-only and exits non-zero when duplicate groups are present.
- Kept unique constraints deferred until staging/production duplicate groups are checked, cleaned, and archived as empty.
- Did not run the command against staging or production in this repository session; choose the target environment explicitly before running it.
- Verified with the same full gate from this local Phase 2 batch:
  - `npx vitest run tests/unique-constraint-duplicate-check.test.ts tests/schema-indexes.test.ts` (`2` files, `8` tests)
  - `npm run typecheck`
  - `npm test` (`166` files, `857` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 VM Operation and Deletion Module Boundary Slice

- Added `src/modules/vm/VMOperationExecutionService.ts`.
- Added `src/modules/vm/VMDeletionAccessService.ts`.
- Added `tests/vm-operation-execution-service.test.ts`.
- Added `tests/vm-deletion-access-service.test.ts`.
- Moved boot/shutdown/poweroff/reboot/reset execution out of `VMOperateService` into a VM module service covering:
  - VM ID validation;
  - VM lookup;
  - owner/superadmin permission checks;
  - current power-state checks;
  - PVE operation dispatch;
  - boot task wait and optional guest network identity normalization.
- Moved delete ownership validation, VM lookup, and deletion workflow dispatch out of `VMManageService` into `VMDeletionAccessService`.
- Updated `AIChatVMManagementService` so the AI Chat module depends on VM module ports instead of importing service facades.
- Verified:
  - `npx vitest run tests/vm-operation-execution-service.test.ts tests/vm-deletion-access-service.test.ts tests/vm-operation-policy.test.ts tests/vm-deletion-policy.test.ts tests/vm-deletion-workflow-service.test.ts tests/ai-chat-vm-management-service.test.ts` (`6` files, `37` tests)
  - `npm run typecheck`
  - `npm test` (`169` files, `868` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 AI Chat Platform Guide Service Slice

- Added `src/modules/ai-chat/AIChatPlatformGuideService.ts`.
- Added `tests/ai-chat-platform-guide-service.test.ts`.
- Moved platform-guide loading, prompt construction, user input validation, streaming completion, and non-stream completion out of `AIChatService`.
- `AIChatService` now authenticates the request, resolves the token role, and delegates platform-guide generation through `{ user, userRole, body }`.
- `AIChatService.ts` is now about `141` lines after this extraction.
- `src/modules` has no reverse imports from `src/service`.
- Verified:
  - `npx vitest run tests/ai-chat-platform-guide-service.test.ts tests/ai-chat-box-hint-service.test.ts tests/ai-chat-request-policy.test.ts tests/ai-chat-language-policy.test.ts tests/ai-chat-vm-management-service.test.ts tests/vm-operation-execution-service.test.ts tests/vm-deletion-access-service.test.ts` (`7` files, `35` tests)
  - `npm run typecheck`
  - `npm test` (`169` files, `868` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 PVE Request Adapter Service Slice

- Added `src/modules/pve/PVERequestAdapterService.ts`.
- Added `tests/pve-request-adapter-service.test.ts`.
- Moved PVE route DTO mapping out of `PVEService` for:
  - QEMU config query ID forwarding;
  - PVE nodes fetch through the admin-mode PVE client;
  - multiple-task body `task_ids` forwarding;
  - user task pagination/status query forwarding;
  - refresh body `task_id` forwarding;
  - cleanup and datacenter status workflow delegation.
- Consolidated repeated `PVEService` token-validation/error wrappers for user and superadmin-only PVE routes.
- `PVEService.ts` is now about `157` lines and no longer imports the PVE client, task service, datacenter service, qemu config access service, or PVE API enum directly.
- Verified:
  - `npx vitest run tests/pve-request-adapter-service.test.ts tests/pve-task-service.test.ts tests/pve-qemu-config-access-service.test.ts tests/pve-datacenter-status-service.test.ts tests/pve-qemu-config-dto-factory.test.ts tests/pve-datacenter-status-policy.test.ts tests/pve-client.test.ts` (`7` files, `28` tests)
  - `npm run typecheck`
  - `npm test` (`170` files, `874` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 VM Manage Request Adapter Service Slice

- Added `src/modules/vm/VMManageRequestAdapterService.ts`.
- Added `tests/vm-manage-request-adapter-service.test.ts`.
- Moved VM Manage route DTO mapping out of `VMManageService` for:
  - template creation body forwarding;
  - Box template creation body forwarding;
  - VM config update body forwarding;
  - delete body `vm_id` forwarding into `VMDeletionAccessService`.
- Consolidated repeated `VMManageService` token-validation/error wrappers for create/update/create-from-box routes.
- Removed the leftover service-facade DTO delete entry point after AI Chat moved to VM module ports.
- `VMManageService.ts` is now about `120` lines and imports only the VM Manage request adapter from `modules/vm`.
- Verified:
  - `npx vitest run tests/vm-manage-request-adapter-service.test.ts tests/vm-creation-request-service.test.ts tests/vm-config-update-workflow-service.test.ts tests/vm-deletion-access-service.test.ts tests/vm-deletion-workflow-service.test.ts tests/vm-creation-workflow-service.test.ts tests/vm-config-execution-service.test.ts` (`7` files, `31` tests)
  - `npm run typecheck`
  - `npm test` (`171` files, `878` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Template Manage Request Adapter Service Slice

- Added `src/modules/templates/TemplateManageRequestAdapterService.ts`.
- Added `tests/template-manage-request-adapter-service.test.ts`.
- Moved Template Manage route DTO mapping out of `TemplateManageService` for:
  - config update body forwarding;
  - delete body `template_id` forwarding;
  - clone body forwarding into the superadmin-only clone workflow.
- Consolidated repeated `TemplateManageService` token-validation/error wrappers for user and superadmin routes.
- `TemplateManageService.ts` is now about `68` lines and imports only the Template Manage request adapter from `modules/templates`.
- Verified:
  - `npx vitest run tests/template-manage-request-adapter-service.test.ts tests/template-config-update-service.test.ts tests/template-deletion-service.test.ts tests/template-clone-service.test.ts tests/template-list-service.test.ts tests/template-conversion-service.test.ts tests/template-audit-service.test.ts` (`7` files, `40` tests)
  - `npm run typecheck`
  - `npm test` (`172` files, `881` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 CRP Request Adapter Service Slice

- Added `src/modules/crp/ComputeResourcePlanRequestAdapterService.ts`.
- Added `tests/compute-resource-plan-request-adapter-service.test.ts`.
- Moved Compute Resource Plan route DTO mapping out of `SuperAdminCRPService` for:
  - create body forwarding;
  - update params/body forwarding;
  - delete params forwarding;
  - get-by-id params forwarding;
  - list delegation without request-shaped data.
- Consolidated repeated `SuperAdminCRPService` token-validation/error wrappers for user and superadmin routes.
- `SuperAdminCRPService.ts` is now about `84` lines and imports only the CRP request adapter from `modules/crp`.
- Verified:
  - `npx vitest run tests/compute-resource-plan-request-adapter-service.test.ts tests/compute-resource-plan-management-service.test.ts tests/compute-resource-plan-policy.test.ts` (`3` files, `19` tests)
  - `npm run typecheck`
  - `npm test` (`173` files, `886` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 SuperAdmin Request Adapter Service Slice

- Added `src/modules/super-admin/SuperAdminRequestAdapterService.ts`.
- Added `tests/super-admin-request-adapter-service.test.ts`.
- Moved SuperAdmin route DTO mapping out of `SuperAdminService` for:
  - role-change body `userId`/`newRole` forwarding;
  - CRP-assignment body `userId`/`planId` forwarding;
  - user/admin list delegation without request-shaped data.
- Consolidated repeated `SuperAdminService` superadmin token-validation/error wrappers.
- `SuperAdminService.ts` is now about `61` lines and imports only the SuperAdmin request adapter from `modules/super-admin`.
- Verified:
  - `npx vitest run tests/super-admin-request-adapter-service.test.ts tests/super-admin-user-management-service.test.ts tests/super-admin-user-mutation-policy.test.ts` (`3` files, `12` tests)
  - `npm run typecheck`
  - `npm test` (`174` files, `889` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Auth Session Service Slice

- Added `src/modules/auth/AuthSessionService.ts`.
- Added `tests/auth-session-service.test.ts`.
- Moved Auth verify/logout session behavior out of `AuthService` for:
  - verification persistence and success response assembly;
  - logout success response assembly;
  - null-user compatibility with the existing service-level response behavior.
- Consolidated `AuthService` verify/logout token-validation and error handling through one private wrapper.
- `AuthService.ts` is now about `74` lines and delegates register/login/forgot-password/session behavior to Auth modules.
- Verified:
  - `npx vitest run tests/auth-session-service.test.ts tests/auth-forgot-password-service.test.ts tests/auth-login-service.test.ts tests/auth-registration-service.test.ts tests/auth-token-policy.test.ts` (`5` files, `29` tests)
  - `npm run typecheck`
  - `npm test` (`175` files, `893` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Course Structure Request Adapter Service Slice

- Added `src/modules/courses/CourseStructureRequestAdapterService.ts`.
- Added `tests/course-structure-request-adapter-service.test.ts`.
- Moved Class/Chapter route DTO mapping out of service facades for:
  - class get/update/delete route `classId` forwarding;
  - add-class route `courseId` and body forwarding;
  - chapter get/update/delete route `chapterId` forwarding;
  - add-chapter route `classId` and body forwarding.
- Consolidated repeated `ClassService` and `ChapterService` token-validation/error wrappers while keeping controller response shapes unchanged.
- `ClassService.ts` is now about `56` lines and `ChapterService.ts` is now about `89` lines.
- Verified:
  - `npx vitest run tests/course-structure-request-adapter-service.test.ts tests/class-management-service.test.ts tests/chapter-management-service.test.ts tests/class-content-policy.test.ts tests/chapter-content-policy.test.ts tests/course-request-adapter-service.test.ts` (`6` files, `31` tests)
  - `npm run typecheck`
  - `npm test` (`176` files, `895` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 Template Request Adapter Service Slice

- Added `src/modules/templates/TemplateRequestAdapterService.ts`.
- Added `tests/template-request-adapter-service.test.ts`.
- Moved Template route DTO mapping out of `TemplateService` for:
  - all-template and accessible-template list delegation;
  - VM-to-template conversion body forwarding;
  - submitted-template creation body forwarding;
  - submitted-template list delegation;
  - submitted-template audit body forwarding.
- Consolidated repeated `TemplateService` token-validation/error wrappers for user, admin, and superadmin routes while keeping controller response shapes unchanged.
- `TemplateService.ts` is now about `106` lines and imports only the Template request adapter from `modules/templates`.
- Verified:
  - `npx vitest run tests/template-request-adapter-service.test.ts tests/template-list-service.test.ts tests/template-conversion-service.test.ts tests/template-submission-create-service.test.ts tests/template-audit-service.test.ts tests/template-submission-audit-policy.test.ts` (`6` files, `28` tests)
  - `npm run typecheck`
  - `npm test` (`177` files, `897` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, and `git diff --check`

### 2026-05-26 VM Read Request Adapter Service Slice

- Added `src/modules/vm/VMReadRequestAdapterService.ts`.
- Added `tests/vm-read-request-adapter-service.test.ts`.
- Moved VM read route DTO mapping out of `VMService` for:
  - user-owned VM list delegation;
  - all-VM list delegation;
  - status query `vm_id` forwarding;
  - network-info query `vm_id` forwarding.
- Consolidated `VMService` user/superadmin token-validation wrappers while preserving the existing SuperAdmin-or-user read context behavior.
- `VMService.ts` is now about `90` lines and imports only the VM read request adapter from `modules/vm`.
- Verified:
  - `npx vitest run tests/vm-read-request-adapter-service.test.ts tests/vm-read-service.test.ts tests/vm-operation-policy.test.ts` (`3` files, `18` tests)
  - `npm run typecheck`
  - `npm test` (`178` files, `899` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, `src/modules` reverse-import scan, and `git diff --check`

### 2026-05-26 AI Box Build Request Adapter Service Slice

- Added `src/modules/ai-box-build/AIBoxBuildRequestAdapterService.ts`.
- Added `tests/ai-box-build-request-adapter-service.test.ts`.
- Moved AI Box Build route DTO mapping out of `AIBoxBuildService` for:
  - job creation body forwarding;
  - job list/get/delete params forwarding;
  - draft message params/body forwarding;
  - job status params/body forwarding;
  - run launch params/body/authorization-header forwarding.
- Consolidated repeated `AIBoxBuildService` admin token-validation/error wrappers while preserving the static `runningJobs` coordination for launch and job management.
- `AIBoxBuildService.ts` is now about `101` lines and delegates job/run request mapping to the AI Box Build request adapter.
- Verified:
  - `npx vitest run tests/ai-box-build-request-adapter-service.test.ts tests/ai-box-build-draft-service.test.ts tests/ai-box-build-job-management-service.test.ts tests/ai-box-build-run-launch-service.test.ts tests/ai-box-build-run-execution-service.test.ts` (`5` files, `23` tests)
  - `npm run typecheck`
  - `npm test` (`179` files, `902` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, `src/modules` reverse-import scan, and `git diff --check`

### 2026-05-26 AI Chat Request Adapter Service Slice

- Added `src/modules/ai-chat/AIChatRequestAdapterService.ts`.
- Added `tests/ai-chat-request-adapter-service.test.ts`.
- Moved AI Chat route DTO mapping out of `AIChatService` for:
  - Box hint stream and non-stream body forwarding;
  - platform-guide stream and non-stream body/user-role forwarding;
  - VM-management body forwarding and SuperAdmin context mapping.
- Consolidated `AIChatService` user/admin token-validation, role-resolution, and stream error helpers while keeping stream/non-stream response shapes unchanged.
- `AIChatService.ts` is now about `125` lines and imports only the AI Chat request adapter from `modules/ai-chat`.
- Verified:
  - `npx vitest run tests/ai-chat-request-adapter-service.test.ts tests/ai-chat-box-hint-service.test.ts tests/ai-chat-platform-guide-service.test.ts tests/ai-chat-vm-management-service.test.ts tests/ai-chat-request-policy.test.ts tests/ai-chat-language-policy.test.ts` (`6` files, `30` tests)
  - `npm run typecheck`
  - `npm test` (`180` files, `905` tests)
  - `npm run build`
  - `npm audit --audit-level=moderate` (`0` vulnerabilities)
  - conflict-marker scan, backend `console.*` scan, `src/modules` reverse-import scan, and `git diff --check`
