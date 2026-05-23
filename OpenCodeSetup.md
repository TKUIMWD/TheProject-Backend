# OpenCode Setup

本文記錄 CSTG 後端 AI build 使用 OpenCode 的安裝、設定與驗證方式。不要把實際 API key 寫進此檔案或提交到版本控制。

## Current Runtime

- Host: `192.168.20.141`
- Backend path: `/home/tkuimwd/Documents/GitHub/TheProject-Backend`
- Current binary path: `/home/tkuimwd/.opencode/bin/opencode`
- Current verified version: `1.15.7`
- Backend env key: `OPENCODE_BIN=/home/tkuimwd/.opencode/bin/opencode`
- Required helper for non-dry-run setup execution: `sshpass`

## Install OpenCode

官方 Linux/macOS 安裝方式：

```bash
curl -fsSL https://opencode.ai/install | bash
```

確認 binary：

```bash
~/.opencode/bin/opencode --version
command -v opencode || true
```

如果 installer 把 binary 放到不同位置，後端 `.env` 的 `OPENCODE_BIN` 必須改成實際路徑：

```env
OPENCODE_BIN=/absolute/path/to/opencode
```

## AI Service Provider

CSTG AI service 走 OpenAI-compatible API。後端不依賴互動式 `/connect`，而是在每個 AI build workspace 產生 `opencode.json`，並用環境變數提供 API key。

必要 `.env`：

```env
OPENAI_BASE_URL=https://tkuimaisvc.ethci.app/v1
OPENAI_API_KEY=replace_with_real_key
OPENAI_BOX_BUILD_MODELS=qwen3.6:35b-a3b-q8_0,gemma4:31b
OPENAI_BOX_BUILD_MODEL=qwen3.6:35b-a3b-q8_0
OPENAI_MODEL=qwen3.6:35b-a3b-q8_0
OPENCODE_BOX_BUILD_MODEL=qwen3.6:35b-a3b-q8_0
```

`OPENAI_API_KEY` 只能放在部署環境或 `.env`，不要寫入 `OpenCodeSetup.md`、`opencode.json` 範本或 git commit。

## Generated opencode.json

後端會在 AI build workspace 寫入以下結構。provider id 固定為 `cstg`，所以執行模型會是 `cstg/<model-id>`。

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "cstg": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CSTG AI Service",
      "options": {
        "baseURL": "{env:OPENAI_BASE_URL}",
        "apiKey": "{env:OPENAI_API_KEY}"
      },
      "models": {
        "qwen3.6:35b-a3b-q8_0": {
          "name": "qwen3.6:35b-a3b-q8_0"
        }
      }
    }
  }
}
```

相關程式位置：

- `src/service/AIBoxBuildService.ts`
- `_buildOpenCodeConfig()`
- `_runOpencodeGenerator()`
- `_validateRuntimePreflight()`

## Backend Execution Flow

AI build 執行時，後端會：

1. 建立 workspace：`OPENCODE_BOX_BUILD_WORKDIR`
2. 複製 reference bundle：`OPENCODE_BOX_BUILD_REFERENCE_ROOT`
3. 產生 `opencode.json`
4. 執行 OpenCode：

```bash
OPENCODE_DISABLE_AUTOUPDATE=true \
/home/tkuimwd/.opencode/bin/opencode run \
  --dir "$WORKSPACE" \
  --model "cstg/qwen3.6:35b-a3b-q8_0" \
  --dangerously-skip-permissions \
  "$PROMPT"
```

5. 要求 OpenCode 產出：

- `design.md`
- `setup.md`
- `writeup.md`
- `generated/setup.sh`
- `generated/validation.sh`

6. 若 OpenCode 未能完成，後端可用 reference-backed fallback 產生檔案。
7. 非 dry-run 會把 `generated/setup.sh` 上傳到 VM 執行，再執行 `generated/validation.sh` 驗證。

## Runtime Env Keys

```env
OPENCODE_BOX_BUILD_WORKDIR=/home/tkuimwd/.cstg-ai-box-build-workspaces
OPENCODE_BOX_BUILD_REFERENCE_ROOT=/home/tkuimwd/.cstg-ai-box-build-references
OPENCODE_BOX_BUILD_REFERENCE_MAX_FILES=600
OPENCODE_BOX_BUILD_REFERENCE_MAX_BYTES=52428800
OPENCODE_BOX_BUILD_DEFAULT_TARGET_NODE=gapvea
OPENCODE_BOX_BUILD_TEMPLATE_STORAGE_NODE=gapveb
OPENCODE_BOX_BUILD_BLOCKED_TARGET_NODES=gapvec
OPENCODE_BOX_BUILD_PREPARE_CLOUD_INIT=true
OPENCODE_BOX_BUILD_IPCONFIG0=ip=dhcp
OPENCODE_BOX_BUILD_TIMEOUT_MS=180000
OPENCODE_BOX_BUILD_PREFLIGHT_TIMEOUT_MS=10000
OPENCODE_BOX_BUILD_SETUP_TIMEOUT_MS=1200000
OPENCODE_BOX_BUILD_VALIDATION_TIMEOUT_MS=480000
OPENCODE_BOX_BUILD_STALE_AFTER_MS=5400000
OPENCODE_BOX_BUILD_IP_WAIT_ATTEMPTS=60
OPENCODE_BOX_BUILD_IP_WAIT_MS=5000
```

Node policy:

- Runtime target: `gapvea`
- Template storage: `gapveb`
- Blocked: `gapvec`

## Verification

在後端主機上執行：

```bash
cd /home/tkuimwd/Documents/GitHub/TheProject-Backend

OPENCODE_DISABLE_AUTOUPDATE=true "$OPENCODE_BIN" --version
sshpass -V
curl -fsS "$OPENAI_BASE_URL/models" \
  -H "Authorization: Bearer $OPENAI_API_KEY" | jq .
npx tsc --noEmit
```

若要只驗證 OpenCode workspace config，可建立暫存目錄：

```bash
tmpdir="$(mktemp -d)"
cat > "$tmpdir/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "cstg": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CSTG AI Service",
      "options": {
        "baseURL": "{env:OPENAI_BASE_URL}",
        "apiKey": "{env:OPENAI_API_KEY}"
      },
      "models": {
        "qwen3.6:35b-a3b-q8_0": {
          "name": "qwen3.6:35b-a3b-q8_0"
        }
      }
    }
  }
}
JSON

OPENCODE_DISABLE_AUTOUPDATE=true "$OPENCODE_BIN" run \
  --dir "$tmpdir" \
  --model "cstg/qwen3.6:35b-a3b-q8_0" \
  "Reply with one sentence."
```

## Troubleshooting

- `opencode is not executable`: check `OPENCODE_BIN`, file permission, and PATH.
- model/provider not found: confirm workspace `opencode.json` contains provider `cstg` and the selected model id.
- 401/403 from AI service: check `OPENAI_API_KEY`; do not log the key.
- connection failure: check `OPENAI_BASE_URL`, DNS, TLS, and `/v1/models`.
- OpenCode timeout: increase `OPENCODE_BOX_BUILD_TIMEOUT_MS` only after checking run logs.
- generated files missing: inspect workspace under `OPENCODE_BOX_BUILD_WORKDIR`; backend expects all five required files.
- VM setup execution failure: verify `sshpass`, VM IP, `ciuser`, `cipassword`, and guest SSH availability.

## Sources

- OpenCode download: https://opencode.ai/download
- OpenCode config docs: https://dev.opencode.ai/docs/config/
- OpenCode provider docs: https://dev.opencode.ai/docs/providers/
