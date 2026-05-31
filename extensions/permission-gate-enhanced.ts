/**
 * Permission Gate Extension — Rule-based (增强版)
 *
 * 通过静态规则配置拦截敏感文件读取和操作：
 * - 全局规则：~/.pi/agent/permission-rules.json
 * - 项目规则：<项目目录>/.pi/permission-rules.json
 * - 支持 glob 模式匹配路径
 * - 支持按工具类型（read/bash/edit/write）过滤
 * - 支持 trustedPaths 配置（信任目录，自动放行）
 * - 记住用户的权限选择（跨会话）
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { minimatch } from "minimatch";

// ── Rule definitions ──────────────────────────────────────────────────

interface PermissionRule {
	tools: string[];
	pathPattern: string;
	label: string;
	action?: "allow" | "deny" | "ask"; // 可选：直接指定动作
}

interface PermissionRulesFile {
	rules: PermissionRule[];
	trustedPaths?: string[]; // 信任目录列表，自动放行
	defaultAction?: "allow" | "deny" | "ask"; // 默认动作
}

// ── Persisted permission ──────────────────────────────────────────────

interface Permission {
	pattern: string;
	action: "allow" | "deny";
}

// ── 配置文件路径 ──────────────────────────────────────────────────────

function getGlobalRuleFilePath(): string {
	const home = os.homedir();
	return path.join(home, ".pi", "agent", "permission-rules.json");
}

function getProjectRuleFilePath(cwd: string): string {
	return path.join(cwd, ".pi", "permission-rules.json");
}

// ── 加载规则 ──────────────────────────────────────────────────────────

function loadRulesFromFile(filePath: string): PermissionRulesFile {
	if (!existsSync(filePath)) return { rules: [] };
	try {
		const raw = readFileSync(filePath, "utf-8");
		return JSON.parse(raw) as PermissionRulesFile;
	} catch {
		return { rules: [] };
	}
}

function loadAllRules(cwd: string): {
	rules: PermissionRule[];
	trustedPaths: string[];
	defaultAction: "allow" | "deny" | "ask";
} {
	// 加载全局规则
	const globalConfig = loadRulesFromFile(getGlobalRuleFilePath());
	
	// 加载项目级规则
	const projectConfig = loadRulesFromFile(getProjectRuleFilePath(cwd));
	
	// 合并规则（项目级优先）
	const rules = [
		...(globalConfig.rules || []),
		...(projectConfig.rules || []),
	];
	
	// 合并信任路径
	const trustedPaths = [
		...(globalConfig.trustedPaths || []),
		...(projectConfig.trustedPaths || []),
	];
	
	// 默认动作（项目级优先）
	const defaultAction = projectConfig.defaultAction || globalConfig.defaultAction || "ask";
	
	return { rules, trustedPaths, defaultAction };
}

// ── 路径匹配 ──────────────────────────────────────────────────────────

/**
 * 检查路径是否在信任目录中
 */
function isInTrustedPath(targetPath: string, trustedPaths: string[]): boolean {
	if (!targetPath || trustedPaths.length === 0) return false;
	
	const absTarget = path.resolve(targetPath);
	
	for (const trustedPath of trustedPaths) {
		const absTrusted = path.resolve(trustedPath);
		
		// 检查目标路径是否以信任路径开头
		if (absTarget.startsWith(absTrusted + path.sep) || absTarget === absTrusted) {
			return true;
		}
	}
	
	return false;
}

/**
 * 检查一个 tool_call 是否匹配任何已配置的规则。
 * 返回匹配的规则，或 null 表示无需拦截。
 */
function findMatchingRule(
	toolName: string,
	input: Record<string, unknown>,
	rules: PermissionRule[],
): PermissionRule | null {
	const toolLower = toolName.toLowerCase();

	for (const rule of rules) {
		// 检查工具是否匹配
		const toolMatch = rule.tools.some(
			(t) => t.toLowerCase() === toolLower,
		);
		if (!toolMatch) continue;

		// 提取被操作的路径
		let targetPath: string | undefined;
		if (toolName === "bash") {
			const cmd = input.command as string | undefined;
			if (cmd) targetPath = cmd;
		} else if (toolName === "read" || toolName === "edit" || toolName === "write") {
			targetPath = input.path as string | undefined;
		}

		if (!targetPath) continue;

		// 规范化路径：去掉 ./ 前缀
		const normalizedPath = targetPath.startsWith('./') ? targetPath.slice(2) : targetPath;

		// 对于 bash 命令，使用字符串包含检查（glob 不适用于命令参数）
		if (toolName === "bash") {
			// 将 glob 模式转为正则：* 匹配任意非空格字符，** 匹配任意路径（包括空格分隔的参数）
			let pattern = rule.pathPattern;
			// ** 在开头时，匹配任意前缀（包括空）
			if (pattern.startsWith('**/')) {
				pattern = pattern.replace('**/', '(?:.*\/)?');
			}
			pattern = pattern.replace(/\*\*/g, '.*');
			pattern = pattern.replace(/\*/g, '[^ ]*');
			const regex = new RegExp('^' + pattern + '$');
			if (regex.test(normalizedPath)) {
				return rule;
			}
			continue;
		}

		// 对于文件路径，使用 glob 匹配
		if (minimatch(normalizedPath, rule.pathPattern, { nocase: false })) {
			return rule;
		}
		// 也尝试匹配绝对路径展开
		if (rule.pathPattern.startsWith("**")) {
			const abs = path.resolve(normalizedPath);
			if (minimatch(abs, rule.pathPattern)) {
				return rule;
			}
		}
	}

	return null;
}

// ── Extension entry ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// 运行时状态
	let currentCwd = "";
	let rules: PermissionRule[] = [];
	let trustedPaths: string[] = [];
	let defaultAction: "allow" | "deny" | "ask" = "ask";
	const permissions: Permission[] = [];

	// 规则文件热加载
	let globalWatcher: FSWatcher | null = null;
	let projectWatcher: FSWatcher | null = null;

	function reloadRules() {
		const config = loadAllRules(currentCwd);
		rules = config.rules;
		trustedPaths = config.trustedPaths;
		defaultAction = config.defaultAction;
	}

	function setupWatchers() {
		// 清理旧的 watcher
		globalWatcher?.close();
		projectWatcher?.close();
		
		// 全局规则文件 watcher
		const globalPath = getGlobalRuleFilePath();
		if (existsSync(globalPath)) {
			globalWatcher = watch(globalPath, () => reloadRules());
		}
		
		// 项目规则文件 watcher
		if (currentCwd) {
			const projectPath = getProjectRuleFilePath(currentCwd);
			if (existsSync(projectPath)) {
				projectWatcher = watch(projectPath, () => reloadRules());
			}
		}
	}

	// 从 session 恢复持久化权限
	pi.on("session_start", async (_event, ctx) => {
		permissions.length = 0;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (
				entry.type === "message" &&
				entry.message.role === "toolResult" &&
				entry.message.toolName === "permission_result"
			) {
				const details = entry.message.details as { permissions?: Permission[] };
				if (details?.permissions) {
					permissions.push(...details.permissions);
				}
			}
		}
		
		// 获取当前工作目录
		currentCwd = ctx.cwd;
		
		// 加载规则
		reloadRules();
		
		// 设置热加载
		setupWatchers();
	});

	pi.on("session_shutdown", async () => {
		globalWatcher?.close();
		projectWatcher?.close();
		globalWatcher = null;
		projectWatcher = null;
	});

	// ── tool_call 拦截器：规则匹配 ──────────────────────────────────

	pi.on("tool_call", async (event, ctx) => {
		// 调试日志
		console.error(`[PermissionGate] tool_call: ${event.toolName}, input: ${JSON.stringify(event.input)}`);
		console.error(`[PermissionGate] currentCwd: ${currentCwd}, rules count: ${rules.length}`);
		
		// 跳过 request_permission 工具本身
		if (event.toolName === "request_permission") return;

		// 提取目标路径
		let targetPath: string | undefined;
		if (event.toolName === "bash") {
			targetPath = event.input.command as string | undefined;
		} else if (event.toolName === "read" || event.toolName === "edit" || event.toolName === "write") {
			targetPath = event.input.path as string | undefined;
		}
		
		console.error(`[PermissionGate] targetPath: ${targetPath}`);

		// 检查是否在信任目录中
		if (targetPath && isInTrustedPath(targetPath, trustedPaths)) {
			console.error(`[PermissionGate] trusted path, allowing`);
			return; // 信任目录，直接放行
		}

		// 查找匹配的规则
		const rule = findMatchingRule(event.toolName, event.input, rules);
		console.error(`[PermissionGate] matched rule: ${rule ? rule.label : "null"}`);
		
		// 如果没有匹配的规则，使用默认动作
		if (!rule) {
			console.error(`[PermissionGate] no rule matched, defaultAction: ${defaultAction}`);
			switch (defaultAction) {
				case "allow":
					return; // 放行
				case "deny":
					return { block: true, reason: "默认拒绝策略" };
				case "ask":
				default:
					// 询问用户
					if (!ctx.hasUI) {
						return { block: true, reason: "无 UI 模式，默认拒绝" };
					}
					const defaultChoice = await ctx.ui.select(
						`⚠️ 未配置的操作\n\n工具: ${event.toolName}\n目标: ${targetPath || "未知"}\n\n允许吗？`,
						["允许本次", "拒绝本次"]
					);
					return defaultChoice === "允许本次" ? undefined : { block: true, reason: "用户拒绝" };
			}
		}

		// 如果规则指定了直接动作
		if (rule.action === "allow") {
			console.error(`[PermissionGate] rule action=allow, allowing`);
			return;
		}
		if (rule.action === "deny") {
			console.error(`[PermissionGate] rule action=deny, blocking`);
			return { block: true, reason: `已拒绝: ${rule.label}` };
		}

		// key 包含当前工作目录，实现项目级权限隔离
		const key = `${currentCwd}:${event.toolName}:${rule.pathPattern}`;

		// 检查是否有持久化权限
		const existing = permissions.find((p) => p.pattern === key);
		if (existing?.action === "allow") {
			console.error(`[PermissionGate] remembered allow`);
			return;
		}
		if (existing?.action === "deny") {
			console.error(`[PermissionGate] remembered deny`);
			return { block: true, reason: `已拒绝: ${rule.label}` };
		}

		// 无 UI 模式默认拒绝
		if (!ctx.hasUI) {
			return { block: true, reason: "无 UI 模式，敏感操作已拒绝" };
		}

		console.error(`[PermissionGate] showing UI prompt...`);
		const choice = await ctx.ui.select(
			`⚠️ 敏感操作 — ${rule.label}\n\n规则: ${rule.pathPattern}\n工具: ${event.toolName}\n目标: ${targetPath || "未知"}\n\n允许吗？`,
			["允许本次", "始终允许", "拒绝本次", "始终拒绝"],
		);

		console.error(`[PermissionGate] user choice: ${choice}`);
		
		switch (choice) {
			case "始终允许": {
				permissions.push({ pattern: key, action: "allow" });
				return {
					content: [{ type: "text", text: `权限已授予并记住: ${rule.label}` }],
					details: { decision: "allow", permissions: [...permissions] },
				};
			}
			case "允许本次":
				return; // 直接放行
			case "始终拒绝": {
				permissions.push({ pattern: key, action: "deny" });
				return { block: true, reason: `已拒绝并记住: ${rule.label}` };
			}
			default:
				return { block: true, reason: "用户拒绝本次操作" };
		}
	});

	// ── request_permission 工具（保留，用于手动权限请求） ─────────

	pi.registerTool({
		name: "request_permission",
		label: "Request Permission",
		description:
			"Call this tool when you are about to perform a potentially risky operation. The user will be prompted to allow or deny it.",
		parameters: Type.Object({
			operation: Type.String({
				description: "Description of the operation, e.g., 'write to src/main.ts'",
			}),
			command: Type.String({
				description: "The exact command or file path involved",
			}),
			reason: Type.String({
				description: "Why this operation is needed",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			// key 包含当前工作目录，实现项目级权限隔离
			const key = `${currentCwd}:manual:${params.command}`;
			const existing = permissions.find((p) => p.pattern === key);
			if (existing?.action === "allow") {
				return { content: [{ type: "text", text: "已自动批准（记忆）" }], details: { decision: "allow" } };
			}
			if (existing?.action === "deny") {
				return { content: [{ type: "text", text: "已自动拒绝（记忆）" }], details: { decision: "deny" } };
			}

			if (!ctx.hasUI) {
				return { content: [{ type: "text", text: "已拒绝（无 UI）" }], details: { decision: "deny" } };
			}

			const choice = await ctx.ui.select(
				`⚠️ 请求权限\n\n操作: ${params.operation}\n命令: ${params.command}\n原因: ${params.reason}\n\n允许吗？`,
				["允许本次", "始终允许", "拒绝本次", "始终拒绝"],
			);

			switch (choice) {
				case "始终允许": {
					permissions.push({ pattern: key, action: "allow" });
					return {
						content: [{ type: "text", text: "已批准并记住" }],
						details: { decision: "allow", permissions: [...permissions] },
					};
				}
				case "允许本次":
					return { content: [{ type: "text", text: "已批准本次" }], details: { decision: "allow" } };
				case "始终拒绝": {
					permissions.push({ pattern: key, action: "deny" });
					return {
						content: [{ type: "text", text: "已拒绝并记住" }],
						details: { decision: "deny", permissions: [...permissions] },
					};
				}
				default:
					return { content: [{ type: "text", text: "已拒绝" }], details: { decision: "deny" } };
			}
		},
	});
}
