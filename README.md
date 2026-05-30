# 🔐 pi-permission-gate

Rule-based permission gate extension for the [Pi coding agent](https://github.com/mariozechner/pi-coding-agent). It intercepts sensitive file operations and dangerous commands with configurable rules and trusted paths.

## What Makes It Different

`pi-permission-gate` is intentionally simple and deterministic:

```text
tool_call → rule matching → user confirmation → allow/deny
```

It is **not** an AI-powered security analyzer and not a sandbox.

- If you need comprehensive policy enforcement with MCP support, look at `pi-permission-system`.
- If you need a simple, rule-based permission gate with Chinese UI, `pi-permission-gate` is the focused tool.

## Best For

- Pi users who want **simple, predictable** permission control.
- Preventing accidental modifications to sensitive files (SSH keys, env files, git credentials).
- Blocking dangerous commands (`rm -rf`, `sudo`).
- Project-level permission configurations.
- Chinese-speaking users who prefer Chinese confirmation dialogs.

## Features

- **Rule-based permissions** — Configure rules via JSON files with glob pattern matching.
- **Trusted paths** — Auto-allow operations in trusted directories.
- **Project-level config** — Per-project permission rules in `.pi/permission-rules.json`.
- **Permission memory** — Remember user choices (allow/deny) across sessions.
- **Hot reload** — Config changes take effect immediately without restarting pi.
- **Chinese UI** — Confirmation dialogs in Chinese.
- **Three action modes** — `allow`, `deny`, `ask` for flexible control.
- **Manual permission request** — Built-in `request_permission` tool for explicit permission requests.

## Installation

### From GitHub (Recommended)

```bash
pi install git:github.com/CNCSMonster/pi-permission-gate
```

### From npm (coming soon)

> Not yet published to npm. Use GitHub installation for now.
>
> ```bash
> pi install npm:pi-permission-gate
> ```

### From local path (development)

```bash
pi install /path/to/pi-permission-gate
# or
pi install ./pi-permission-gate
```

## Quick Start

### 1. Create global config

Create `~/.pi/agent/permission-rules.json`:

```json
{
  "defaultAction": "ask",
  "rules": [
    {
      "tools": ["read"],
      "pathPattern": "**/.ssh/**",
      "label": "SSH 私钥和配置",
      "action": "deny"
    },
    {
      "tools": ["read"],
      "pathPattern": "**/.env*",
      "label": "环境变量文件",
      "action": "deny"
    },
    {
      "tools": ["bash"],
      "pathPattern": "**/rm -rf *",
      "label": "递归删除操作",
      "action": "deny"
    }
  ]
}
```

### 2. (Optional) Create project config

Create `<your-project>/.pi/permission-rules.json`:

```json
{
  "trustedPaths": ["./data", "./tmp", "./output"],
  "rules": [
    {
      "tools": ["read", "write", "edit"],
      "pathPattern": "**/*",
      "label": "项目文件",
      "action": "allow"
    }
  ]
}
```

### 3. Restart pi

The extension auto-loads and enforces your rules.

## Configuration

### Rule Format

```json
{
  "tools": ["read", "write", "edit", "bash"],
  "pathPattern": "**/.ssh/**",
  "label": "描述",
  "action": "deny"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tools` | `string[]` | Yes | Applicable tools: `read`, `write`, `edit`, `bash` |
| `pathPattern` | `string` | Yes | Glob pattern for matching paths |
| `label` | `string` | Yes | Description shown in confirmation dialog |
| `action` | `"allow" \| "deny" \| "ask"` | No | Direct action. Defaults to `"ask"` |

### Default Action

```json
{
  "defaultAction": "ask"
}
```

| Value | Behavior |
|-------|----------|
| `"allow"` | Allow operations without rules (permissive) |
| `"deny"` | Deny operations without rules (restrictive) |
| `"ask"` | Prompt user for operations without rules (default) |

### Trusted Paths

```json
{
  "trustedPaths": ["/home/user/safe-project", "./data"]
}
```

Paths listed here are auto-allowed without checking rules.

### Config Levels

```
Global: ~/.pi/agent/permission-rules.json
    ↓ merged
Project: <project>/.pi/permission-rules.json
    ↓
Effective rules
```

## User Interaction

When a rule matches with `action: "ask"`:

```
⚠️ 敏感操作 — SSH 私钥和配置

规则: **/.ssh/**
工具: read
目标: /home/user/.ssh/id_rsa

允许吗？
[允许本次] [始终允许] [拒绝本次] [始终拒绝]
```

- **允许本次**: Allow this operation
- **始终允许**: Allow and remember for future sessions
- **拒绝本次**: Deny this operation
- **始终拒绝**: Deny and remember for future sessions

## Architecture

```
tool_call
    ↓
Extract path/command
    ↓
Check trustedPaths → if match, allow
    ↓
Find matching rule
    ↓
No rule? → defaultAction (allow/deny/ask)
    ↓
Rule action = allow → allow
    ↓
Rule action = deny → deny
    ↓
Rule action = ask → check memory → prompt user
```

## Built-in Tools

### `request_permission`

Explicitly request user permission before a risky operation. Use this when the agent wants to confirm a potentially dangerous action.

**Parameters:**
- `operation`: Description of the operation
- `command`: The exact command or file path
- `reason`: Why this operation is needed

## Dependencies

- `minimatch`: Glob pattern matching
- `@mariozechner/pi-coding-agent`: Pi extension API
- `typebox`: Schema definitions

## License

MIT
