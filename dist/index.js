import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as HonchoSDK from "../vendor/honcho-sdk/dist/index.js";
import { tool } from "@opencode-ai/plugin";
const { Honcho } = HonchoSDK;
const SETTINGS_FILE_NAME = "honcho.json";
const SETTINGS_DIR_NAME = ".opencode";
const GLOBAL_SETTINGS_DIR_NAME = "opencode";
const GLOBAL_SETTINGS_FILE_PATH = "honcho.json";
const RUNTIME_SERVICE = "opencode-honcho";
const MAX_RECENT_CONCLUSIONS = 8;
const DEFAULT_SETTINGS = {
    enabled: true,
    apiKey: "",
    baseUrl: "https://api.honcho.dev",
    peerName: "",
    aiPeer: "",
    workspace: "",
    globalOverride: false,
    linkedHosts: [],
    recallMode: "hybrid",
    observation: "directional",
    peerModel: "classic",
    writeFrequency: "async",
    sessionStrategy: "per-repo",
    dialecticReasoningLevel: "low",
    dialecticDynamic: true,
    dialecticMaxChars: 600,
    messageMaxChars: 25_000,
    saveMessages: true,
    contextRefresh: {
        messageThreshold: 30,
        ttlSeconds: 300,
        skipTrivialPrompts: true,
        useSessionStartDialectic: true,
    },
};
const BOOLEAN_KEYS = new Set([
    "enabled",
    "globalOverride",
    "dialecticDynamic",
    "saveMessages",
]);
const NUMBER_KEYS = new Set([
    "dialecticMaxChars",
    "messageMaxChars",
]);
const ENUM_KEYS = {
    recallMode: new Set(["hybrid", "context", "tools"]),
    observation: new Set(["directional", "unified"]),
    peerModel: new Set(["classic", "hierarchical"]),
    sessionStrategy: new Set(["per-repo", "per-directory", "per-session", "global"]),
    dialecticReasoningLevel: new Set(["minimal", "low", "medium", "high", "max"]),
};
const INHERITABLE_STRING_KEYS = new Set(["apiKey", "baseUrl", "peerName", "aiPeer", "workspace"]);
const TOP_LEVEL_SETTING_FIELDS = new Set([
    "enabled",
    "apiKey",
    "baseUrl",
    "peerName",
    "aiPeer",
    "workspace",
    "globalOverride",
    "linkedHosts",
    "recallMode",
    "observation",
    "peerModel",
    "writeFrequency",
    "sessionStrategy",
    "dialecticReasoningLevel",
    "dialecticDynamic",
    "dialecticMaxChars",
    "messageMaxChars",
    "saveMessages",
    "contextRefresh",
]);
const SETTING_FIELD_PATHS = new Set([
    "enabled",
    "apiKey",
    "baseUrl",
    "peerName",
    "aiPeer",
    "workspace",
    "globalOverride",
    "recallMode",
    "observation",
    "peerModel",
    "writeFrequency",
    "sessionStrategy",
    "dialecticReasoningLevel",
    "dialecticDynamic",
    "dialecticMaxChars",
    "messageMaxChars",
    "saveMessages",
    "contextRefresh.messageThreshold",
    "contextRefresh.ttlSeconds",
    "contextRefresh.skipTrivialPrompts",
    "contextRefresh.useSessionStartDialectic",
]);
const DURABLE_PATTERNS = [
    /\b(i prefer|i like|i love|i hate)\b/i,
    /\b(my name is|call me)\b/i,
    /\b(always|never|usually)\b/i,
    /\b(i work on|i maintain|my project)\b/i,
    /\b(please don't|please do|remember that)\b/i,
];
const TRIVIAL_PROMPT_PATTERNS = [
    /^(ok|okay|k|thanks|thank you|continue|go on|next|yes|y|no|n|retry|again)$/i,
    /^(fix it|do it|ship it|run it|keep going)$/i,
];
const TECH_TERM_PATTERN = /\b(react|vue|svelte|angular|fastapi|django|flask|postgres|redis|docker|kubernetes|bun|node|typescript|python|rust|go|graphql|rest|api|auth|oauth|jwt|stripe|webhook)\b/gi;
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const expandEnv = (value) => value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
const clampText = (value, maxChars) => value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 3))}...` : value;
const trimHyphenEdges = (value) => {
    let start = 0;
    let end = value.length;
    while (start < end && value[start] === "-") {
        start += 1;
    }
    while (end > start && value[end - 1] === "-") {
        end -= 1;
    }
    return value.slice(start, end);
};
const normalizeId = (value) => trimHyphenEdges(value.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-")) || "default";
const isLocalBaseUrl = (value) => {
    if (!value.trim())
        return false;
    try {
        const url = new URL(value);
        return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    }
    catch {
        return false;
    }
};
const hasConfiguredAuth = (settings) => Boolean(settings.apiKey) || isLocalBaseUrl(settings.baseUrl);
const readTextPart = (part) => isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : null;
const extractText = (parts) => Array.isArray(parts)
    ? parts.map(readTextPart).filter((value) => Boolean(value)).join("\n").trim()
    : "";
const fingerprint = (value) => normalizeId(value.trim().slice(0, 160));
const coerceBoolean = (value) => {
    if (typeof value === "boolean")
        return value;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true")
            return true;
        if (normalized === "false")
            return false;
    }
    throw new Error(`Expected boolean value, received ${JSON.stringify(value)}`);
};
const coerceNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    throw new Error(`Expected numeric value, received ${JSON.stringify(value)}`);
};
const parseSettingValue = (fieldPath, raw) => {
    if (fieldPath === "linkedHosts") {
        return raw
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
    }
    if (fieldPath === "writeFrequency") {
        if (/^\d+$/.test(raw.trim())) {
            return Number(raw);
        }
        if (["async", "turn", "session"].includes(raw)) {
            return raw;
        }
        throw new Error(`Unsupported writeFrequency '${raw}'`);
    }
    if (fieldPath === "enabled" ||
        fieldPath === "globalOverride" ||
        fieldPath === "dialecticDynamic" ||
        fieldPath === "saveMessages" ||
        fieldPath === "contextRefresh.skipTrivialPrompts" ||
        fieldPath === "contextRefresh.useSessionStartDialectic") {
        return coerceBoolean(raw);
    }
    if (fieldPath === "dialecticMaxChars" ||
        fieldPath === "messageMaxChars" ||
        fieldPath === "contextRefresh.messageThreshold" ||
        fieldPath === "contextRefresh.ttlSeconds") {
        return coerceNumber(raw);
    }
    if (fieldPath in ENUM_KEYS && !ENUM_KEYS[fieldPath].has(raw)) {
        throw new Error(`Unsupported ${fieldPath} value '${raw}'`);
    }
    return raw;
};
const applyRawLayer = (target, raw) => {
    for (const [key, value] of Object.entries(raw)) {
        if (key === "contextRefresh") {
            const refresh = isRecord(value) ? value : {};
            for (const [refreshKey, refreshValue] of Object.entries(refresh)) {
                if (refreshValue === undefined || refreshValue === null) {
                    continue;
                }
                ;
                target.contextRefresh[refreshKey] = refreshValue;
            }
            continue;
        }
        if (value === undefined || value === null) {
            continue;
        }
        if (typeof value === "string") {
            const expanded = expandEnv(value);
            if (INHERITABLE_STRING_KEYS.has(key) && !expanded.trim()) {
                continue;
            }
            ;
            target[key] = expanded;
            continue;
        }
        if (key === "linkedHosts" && Array.isArray(value)) {
            target.linkedHosts = value.filter((item) => typeof item === "string" && item.trim().length > 0);
            continue;
        }
        ;
        target[key] = value;
    }
};
const hostScopedSettings = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    const linkedHosts = Array.isArray(value.linkedHosts)
        ? value.linkedHosts.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];
    return {
        workspace: typeof value.workspace === "string" ? value.workspace : "",
        aiPeer: typeof value.aiPeer === "string" ? value.aiPeer : "",
        linkedHosts,
    };
};
const normalizeScopedSettings = (raw, hostId = "opencode") => {
    const normalized = { ...raw };
    const globalOverride = raw.globalOverride === true;
    const topLevelWorkspace = typeof raw.workspace === "string" ? raw.workspace : "";
    const hostBlock = isRecord(raw.hosts) ? hostScopedSettings(raw.hosts[hostId]) : null;
    if (globalOverride && topLevelWorkspace.trim()) {
        normalized.workspace = topLevelWorkspace;
    }
    else if (hostBlock?.workspace.trim()) {
        normalized.workspace = hostBlock.workspace;
    }
    if (hostBlock?.aiPeer.trim()) {
        normalized.aiPeer = hostBlock.aiPeer;
    }
    if (hostBlock && hostBlock.linkedHosts.length > 0) {
        normalized.linkedHosts = hostBlock.linkedHosts;
    }
    return normalized;
};
const mergeSettings = (...rawLayers) => {
    const merged = {
        ...DEFAULT_SETTINGS,
        contextRefresh: { ...DEFAULT_SETTINGS.contextRefresh },
    };
    for (const raw of rawLayers) {
        applyRawLayer(merged, raw);
    }
    return merged;
};
const setSettingValue = (target, fieldPath, value) => {
    const parts = fieldPath.split(".");
    let current = target;
    for (const part of parts.slice(0, -1)) {
        if (!isRecord(current[part])) {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
};
const listAllowedSettingPaths = () => Array.from(SETTING_FIELD_PATHS).sort();
const extractTopics = (prompt) => {
    const filePaths = prompt.match(/[\w\-/.]+\.(ts|tsx|js|jsx|py|rs|go|md|json|yaml|yml|toml|sql)/gi) || [];
    const quoted = prompt.match(/"([^"]+)"/g)?.map((value) => value.slice(1, -1)) || [];
    const techTerms = prompt.match(TECH_TERM_PATTERN) || [];
    const words = prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    return Array.from(new Set([...filePaths, ...quoted, ...techTerms, ...words.slice(0, 6)])).slice(0, 8);
};
const deriveTopicKey = (prompt) => {
    const topics = extractTopics(prompt);
    return normalizeId(topics.length > 0 ? topics.join(" ") : prompt.toLowerCase().split(/\s+/).slice(0, 8).join(" "));
};
const shouldSkipContextRetrieval = (prompt, settings) => {
    if (!settings.skipTrivialPrompts) {
        return false;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
        return true;
    }
    if (trimmed.length <= 4) {
        return true;
    }
    return TRIVIAL_PROMPT_PATTERNS.some((pattern) => pattern.test(trimmed));
};
const parseSessionSummary = (value) => {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }
    if (isRecord(value) && typeof value.content === "string" && value.content.trim()) {
        return value.content.trim();
    }
    return "";
};
const parseRepresentation = (value) => typeof value === "string" && value.trim() ? value.trim() : "";
const formatPeerContextBlock = (heading, representation, peerCard) => {
    const sections = [];
    if (peerCard && peerCard.length > 0) {
        sections.push(peerCard.map((entry) => `- ${entry}`).join("\n"));
    }
    if (representation) {
        sections.push(representation);
    }
    return sections.length > 0 ? `${heading}\n${sections.join("\n\n")}` : "";
};
const formatPromptContextBlock = (summary, representation) => {
    const sections = [];
    if (summary) {
        sections.push(`Session summary:\n${summary}`);
    }
    if (representation) {
        sections.push(`Relevant Honcho memory:\n${representation}`);
    }
    return sections.join("\n\n");
};
const shouldRefreshPromptContext = (state, topicKey, settings) => {
    if (!state.cachedPromptContext || !state.lastPromptRefreshAt) {
        return true;
    }
    if (state.lastTopicKey !== topicKey) {
        return true;
    }
    if (state.promptCount >= settings.messageThreshold) {
        return true;
    }
    return Date.now() - state.lastPromptRefreshAt >= settings.ttlSeconds * 1000;
};
const parseSettingField = (field) => {
    if (!SETTING_FIELD_PATHS.has(field)) {
        throw new Error(`Unknown setting '${field}'. Allowed fields: ${listAllowedSettingPaths().join(", ")}`);
    }
    return field;
};
const lookupField = (payload, field) => field.split(".").reduce((current, part) => {
    if (!isRecord(current))
        return undefined;
    return current[part];
}, payload);
const extractSessionId = (input) => {
    const eventProperties = isRecord(input?.event) && isRecord(input.event.properties) ? input.event.properties : undefined;
    const value = input?.sessionID ??
        input?.sessionId ??
        input?.session_id ??
        eventProperties?.sessionID ??
        eventProperties?.sessionId;
    return typeof value === "string" && value.length > 0 ? value : "unknown-session";
};
const deriveProjectRoot = (pluginInput, configPathOverride) => {
    if (configPathOverride) {
        const absolute = path.resolve(configPathOverride);
        return path.dirname(path.dirname(absolute));
    }
    const hints = [pluginInput.directory, pluginInput.worktree, pluginInput.project?.worktree].filter((value) => Boolean(value));
    for (const hint of hints) {
        let current = path.resolve(hint);
        while (true) {
            if (existsSync(path.join(current, SETTINGS_DIR_NAME)) || existsSync(path.join(current, ".git"))) {
                return current;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }
            current = parent;
        }
    }
    return path.resolve(pluginInput.directory || pluginInput.worktree || pluginInput.project?.worktree || process.cwd());
};
const configFileForRoot = (rootDir, configPathOverride) => configPathOverride ? path.resolve(configPathOverride) : path.join(rootDir, SETTINGS_DIR_NAME, SETTINGS_FILE_NAME);
const globalSettingsPath = () => {
    const configRoot = process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()
        ? path.resolve(process.env.XDG_CONFIG_HOME)
        : path.join(process.env.HOME || process.env.USERPROFILE || process.cwd(), ".config");
    return path.join(configRoot, GLOBAL_SETTINGS_DIR_NAME, GLOBAL_SETTINGS_FILE_PATH);
};
const readConfigFile = async (configPath) => {
    try {
        return JSON.parse(await readFile(configPath, "utf-8"));
    }
    catch (error) {
        if (isRecord(error) && error.code === "ENOENT") {
            return {};
        }
        throw error;
    }
};
const envSettings = () => ({
    apiKey: process.env.HONCHO_API_KEY || "",
    baseUrl: process.env.HONCHO_URL || process.env.HONCHO_BASE_URL || "",
    peerName: process.env.HONCHO_PEER_NAME || "",
    workspace: process.env.HONCHO_WORKSPACE || process.env.HONCHO_WORKSPACE_ID || "",
    aiPeer: process.env.HONCHO_AI_PEER || "",
});
const resolveSettings = async (rootDir, configPathOverride) => {
    const configPath = configFileForRoot(rootDir, configPathOverride);
    const globalConfigPath = globalSettingsPath();
    const [globalRaw, projectRaw] = await Promise.all([readConfigFile(globalConfigPath), readConfigFile(configPath)]);
    return {
        configPath,
        globalConfigPath,
        settings: mergeSettings(envSettings(), normalizeScopedSettings(globalRaw), normalizeScopedSettings(projectRaw)),
    };
};
const writeSettings = async (configPath, settings) => {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(mergeSettings(settings), null, 2)}\n`, "utf-8");
};
const currentUserName = () => process.env.USER || process.env.LOGNAME || "user";
const deriveAgentLabel = (input, pluginInput) => {
    const candidates = [
        input?.agentID,
        input?.agentId,
        isRecord(input?.agent) ? input.agent.id : undefined,
        isRecord(input?.agent) ? input.agent.name : undefined,
        pluginInput.project?.id,
        "root",
    ];
    const match = candidates.find((candidate) => typeof candidate === "string" && candidate.length > 0);
    return typeof match === "string" ? match : "root";
};
const deriveParentAgentLabel = (input) => {
    const candidates = [
        input?.parentAgentID,
        input?.parentAgentId,
        isRecord(input?.parentAgent) ? input.parentAgent.id : undefined,
        isRecord(input?.parentAgent) ? input.parentAgent.name : undefined,
    ];
    const match = candidates.find((candidate) => typeof candidate === "string" && candidate.length > 0);
    return typeof match === "string" ? match : null;
};
const deriveRuntimeHandle = async (pluginInput, input, configPathOverride) => {
    const rootDir = deriveProjectRoot(pluginInput, configPathOverride);
    const { configPath, globalConfigPath, settings } = await resolveSettings(rootDir, configPathOverride);
    const sessionId = extractSessionId(input);
    const repoName = path.basename(rootDir);
    const workspaceId = normalizeId(settings.workspace || pluginInput.project?.id || repoName);
    const userPeerId = normalizeId(`user:${settings.peerName || currentUserName()}`);
    const agentLabel = deriveAgentLabel(input, pluginInput);
    const parentAgentLabel = deriveParentAgentLabel(input);
    const childAgentPeerId = settings.peerModel === "hierarchical" && parentAgentLabel && parentAgentLabel !== agentLabel
        ? normalizeId(`opencode:${agentLabel}`)
        : null;
    const rootAgentPeerId = normalizeId(settings.aiPeer || "opencode");
    const activeAgentPeerId = childAgentPeerId ?? rootAgentPeerId;
    const parentAgentObserverPeerId = settings.peerModel === "hierarchical" && parentAgentLabel ? normalizeId(`opencode:${parentAgentLabel}`) : null;
    let sessionScope = workspaceId;
    if (settings.sessionStrategy === "per-directory") {
        const cwd = pluginInput.directory || pluginInput.worktree || rootDir;
        sessionScope = `${workspaceId}:${normalizeId(path.basename(cwd))}`;
    }
    else if (settings.sessionStrategy === "per-session") {
        sessionScope = `${workspaceId}:${normalizeId(sessionId)}`;
    }
    else if (settings.sessionStrategy === "global") {
        sessionScope = `${workspaceId}:global`;
    }
    else {
        sessionScope = `${workspaceId}:${normalizeId(repoName)}`;
    }
    const lineage = [activeAgentPeerId];
    if (parentAgentObserverPeerId && parentAgentObserverPeerId !== rootAgentPeerId) {
        lineage.unshift(parentAgentObserverPeerId);
    }
    return {
        rootDir,
        configPath,
        globalConfigPath,
        config: settings,
        workspaceId,
        sessionId,
        sessionKey: normalizeId(`${settings.sessionStrategy}:${sessionScope}:${lineage.join(":")}`),
        userPeerId,
        rootAgentPeerId,
        activeAgentPeerId,
        childAgentPeerId,
        parentAgentObserverPeerId,
    };
};
const buildPeerTopology = (handle) => {
    const userPeer = {
        id: handle.userPeerId,
        observeMe: true,
        observeOthers: false,
    };
    const rootAgentPeer = {
        id: handle.rootAgentPeerId,
        observeMe: true,
        observeOthers: true,
    };
    const childAgentPeer = handle.childAgentPeerId === null
        ? null
        : {
            id: handle.childAgentPeerId,
            observeMe: true,
            observeOthers: false,
            sessionScoped: true,
        };
    const parentAgentObserverPeer = handle.parentAgentObserverPeerId === null
        ? null
        : {
            id: handle.parentAgentObserverPeerId,
            observeMe: false,
            observeOthers: true,
            modelsOnly: childAgentPeer ? [childAgentPeer.id] : [],
        };
    if (handle.config.peerModel === "hierarchical" && childAgentPeer && parentAgentObserverPeer) {
        return {
            sessionPeerConfigs: {
                [childAgentPeer.id]: { observeMe: true, observeOthers: false },
                [parentAgentObserverPeer.id]: { observeMe: false, observeOthers: true },
            },
            describedPeers: {
                userPeer,
                rootAgentPeer,
                childAgentPeer,
                parentAgentObserverPeer,
            },
        };
    }
    return {
        sessionPeerConfigs: {
            [userPeer.id]: { observeMe: true, observeOthers: false },
            [rootAgentPeer.id]: { observeMe: true, observeOthers: true },
        },
        describedPeers: {
            userPeer,
            rootAgentPeer,
            childAgentPeer: null,
            parentAgentObserverPeer: null,
        },
    };
};
const createActiveRuntime = async (pluginInput, input, configPathOverride) => {
    const handle = await deriveRuntimeHandle(pluginInput, input, configPathOverride);
    const honcho = new Honcho({
        apiKey: handle.config.apiKey || undefined,
        baseURL: handle.config.baseUrl || undefined,
        workspaceId: handle.workspaceId,
    });
    const userPeer = await honcho.peer(handle.userPeerId, {
        configuration: { observeMe: true },
    });
    const agentPeer = await honcho.peer(handle.activeAgentPeerId, {
        configuration: { observeMe: true },
    });
    const session = await honcho.session(handle.sessionKey);
    await session.addPeers(buildPeerTopology(handle).sessionPeerConfigs);
    return { ...handle, honcho, session, userPeer, agentPeer };
};
const durableConclusionCandidate = (text, settings) => {
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    if (!DURABLE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        return null;
    }
    return clampText(trimmed, settings.dialecticMaxChars);
};
const extractPromptQuery = (input) => {
    if (!input)
        return "";
    if (typeof input.query === "string")
        return input.query;
    if (typeof input.message === "string")
        return input.message;
    if (Array.isArray(input.messages)) {
        for (let index = input.messages.length - 1; index >= 0; index -= 1) {
            const message = input.messages[index];
            if (isRecord(message) && Array.isArray(message.parts)) {
                const text = extractText(message.parts);
                if (text)
                    return text;
            }
        }
    }
    return extractText(input.parts);
};
const describePeers = (handle) => buildPeerTopology(handle).describedPeers;
const createSessionState = () => ({
    stableContext: null,
    cachedPromptContext: null,
    lastInjectedContext: null,
    recentConclusions: [],
    conclusionFingerprints: new Set(),
    promptCount: 0,
    lastPromptRefreshAt: null,
    lastTopicKey: null,
});
const appendConclusion = (state, content) => {
    state.recentConclusions.unshift(content);
    if (state.recentConclusions.length > MAX_RECENT_CONCLUSIONS) {
        state.recentConclusions.length = MAX_RECENT_CONCLUSIONS;
    }
};
export const createHonchoRuntimePlugin = ({ configPath } = {}) => async (pluginInput) => {
    const sessionStates = new Map();
    const getState = (sessionId) => {
        let current = sessionStates.get(sessionId);
        if (!current) {
            current = createSessionState();
            sessionStates.set(sessionId, current);
        }
        return current;
    };
    const log = async (level, message, extra = {}) => {
        await pluginInput.client.app.log({
            body: {
                service: RUNTIME_SERVICE,
                level,
                message,
                extra,
            },
        });
    };
    const withRuntime = async (input, action, fallback) => {
        const handle = await deriveRuntimeHandle(pluginInput, input, configPath);
        if (!handle.config.enabled) {
            return fallback;
        }
        if (!hasConfiguredAuth(handle.config)) {
            await log("warn", "Honcho runtime is enabled but neither an API key nor a localhost baseUrl is configured.", {
                configPath: handle.configPath,
                globalConfigPath: handle.globalConfigPath,
                workspaceId: handle.workspaceId,
                baseUrl: handle.config.baseUrl,
            });
            return fallback;
        }
        try {
            return await action(await createActiveRuntime(pluginInput, input, configPath));
        }
        catch (error) {
            await log("error", "Honcho runtime operation failed.", {
                message: error instanceof Error ? error.message : String(error),
                sessionId: handle.sessionId,
                workspaceId: handle.workspaceId,
            });
            return fallback;
        }
    };
    const runtimeStatus = async (input) => {
        const handle = await deriveRuntimeHandle(pluginInput, input, configPath);
        const state = getState(handle.sessionId);
        return {
            ok: handle.config.enabled,
            configPath: handle.configPath,
            projectConfigPath: handle.configPath,
            globalConfigPath: handle.globalConfigPath,
            rootDir: handle.rootDir,
            workspace: handle.workspaceId,
            sessionId: handle.sessionId,
            sessionKey: handle.sessionKey,
            recallMode: handle.config.recallMode,
            writeFrequency: handle.config.writeFrequency,
            observation: handle.config.observation,
            sessionStrategy: handle.config.sessionStrategy,
            globalOverride: handle.config.globalOverride,
            linkedHosts: handle.config.linkedHosts,
            saveMessages: handle.config.saveMessages,
            contextRefresh: handle.config.contextRefresh,
            peerModel: handle.config.peerModel,
            configured: hasConfiguredAuth(handle.config),
            localMode: isLocalBaseUrl(handle.config.baseUrl),
            baseUrl: handle.config.baseUrl,
            peers: describePeers(handle),
            recentConclusions: state.recentConclusions,
            stableContext: state.stableContext,
            cachedPromptContext: state.cachedPromptContext,
            lastInjectedContext: state.lastInjectedContext,
        };
    };
    const captureMessage = async (runtime, peer, content, metadata) => {
        if (!runtime.config.saveMessages)
            return;
        const trimmed = clampText(content.trim(), runtime.config.messageMaxChars);
        if (!trimmed)
            return;
        await runtime.session.addMessages(peer.message(trimmed, { metadata }));
    };
    const hydrateSessionStartContext = async (runtime, state) => {
        const dialecticEnabled = runtime.config.contextRefresh.useSessionStartDialectic;
        const [userContextResult, agentContextResult, summariesResult, userChatResult, agentChatResult] = await Promise.allSettled([
            runtime.userPeer.context({
                maxConclusions: 12,
                includeMostFrequent: true,
            }),
            runtime.agentPeer.context({
                maxConclusions: 8,
                includeMostFrequent: true,
            }),
            runtime.session.summaries(),
            dialecticEnabled
                ? runtime.agentPeer.chat(`Summarize what you know about ${runtime.userPeerId} in 2-3 sentences. Focus on durable preferences, current projects, and working style.`, {
                    target: runtime.userPeer,
                    session: runtime.session,
                    reasoningLevel: runtime.config.dialecticReasoningLevel,
                })
                : Promise.resolve(null),
            dialecticEnabled
                ? runtime.agentPeer.chat("Summarize the assistant's recent work context for this project in 2-3 sentences.", {
                    session: runtime.session,
                    reasoningLevel: runtime.config.dialecticReasoningLevel,
                })
                : Promise.resolve(null),
        ]);
        const sections = [];
        if (userContextResult.status === "fulfilled") {
            const block = formatPeerContextBlock("## User Memory Profile", parseRepresentation(userContextResult.value.representation), userContextResult.value.peerCard);
            if (block) {
                sections.push(block);
            }
        }
        if (agentContextResult.status === "fulfilled") {
            const block = formatPeerContextBlock("## Agent Work Context", parseRepresentation(agentContextResult.value.representation), agentContextResult.value.peerCard);
            if (block) {
                sections.push(block);
            }
        }
        if (summariesResult.status === "fulfilled") {
            const summary = parseSessionSummary(summariesResult.value.shortSummary) ||
                parseSessionSummary(summariesResult.value.longSummary);
            if (summary) {
                sections.push(`## Recent Session Summary\n${summary}`);
            }
        }
        if (userChatResult.status === "fulfilled" && userChatResult.value) {
            sections.push(`## AI Summary Of User\n${clampText(userChatResult.value, 800)}`);
        }
        if (agentChatResult.status === "fulfilled" && agentChatResult.value) {
            sections.push(`## AI Self-Reflection\n${clampText(agentChatResult.value, 800)}`);
        }
        state.stableContext = sections.length > 0 ? sections.join("\n\n") : null;
    };
    const refreshPromptContext = async (runtime, state, query) => {
        const topicKey = deriveTopicKey(query);
        if (!shouldRefreshPromptContext(state, topicKey, runtime.config.contextRefresh)) {
            return state.cachedPromptContext;
        }
        const sessionContext = await runtime.session.context({
            summary: true,
            peerPerspective: runtime.agentPeer,
            peerTarget: runtime.userPeer,
            limitToSession: runtime.config.sessionStrategy === "per-session",
            representationOptions: {
                searchQuery: topicKey || undefined,
                searchTopK: 5,
                searchMaxDistance: 0.7,
                maxConclusions: 6,
            },
        });
        const compiled = formatPromptContextBlock(parseSessionSummary(sessionContext.summary), parseRepresentation(sessionContext.peerRepresentation));
        state.cachedPromptContext = compiled || null;
        state.lastPromptRefreshAt = Date.now();
        state.lastTopicKey = topicKey;
        state.promptCount = 0;
        return state.cachedPromptContext;
    };
    const maybeWriteConclusion = async (runtime, content, reason) => {
        const state = getState(runtime.sessionId);
        const normalized = fingerprint(content);
        if (!normalized || state.conclusionFingerprints.has(normalized)) {
            return false;
        }
        state.conclusionFingerprints.add(normalized);
        appendConclusion(state, content);
        state.lastPromptRefreshAt = null;
        await runtime.agentPeer.conclusionsOf(runtime.userPeer).create({
            content,
            sessionId: runtime.session.id,
        });
        await log("info", "Durable Honcho conclusion created.", {
            sessionId: runtime.sessionId,
            sessionKey: runtime.sessionKey,
            reason,
            content,
        });
        return true;
    };
    return {
        event: async ({ event }) => {
            const payload = isRecord(event) ? { event, ...(isRecord(event.properties) ? event.properties : {}) } : { event };
            const sessionId = extractSessionId(payload);
            if (event.type === "command.executed") {
                return;
            }
            if (event.type === "session.deleted" || event.type === "session.error") {
                sessionStates.delete(sessionId);
                return;
            }
            if (event.type === "session.created") {
                await withRuntime(payload, async (runtime) => {
                    const state = getState(runtime.sessionId);
                    await hydrateSessionStartContext(runtime, state);
                    await log("info", "Honcho session initialized for OpenCode.", await runtimeStatus(payload));
                }, undefined);
                return;
            }
            if (event.type === "session.idle" || event.type === "session.compacted") {
                await withRuntime(payload, async () => {
                    await log("info", "Honcho lifecycle boundary observed.", {
                        event: event.type,
                        ...(await runtimeStatus(payload)),
                    });
                }, undefined);
                return;
            }
        },
        "command.execute.before": async (input, output) => {
            const command = typeof input.command === "string" ? input.command : "";
            if (!command.startsWith("honcho:") && !command.startsWith("honcho-")) {
                return;
            }
            output.parts = output.parts || [];
        },
        "shell.env": async (input, output) => {
            const handle = await deriveRuntimeHandle(pluginInput, input, configPath);
            if (handle.config.apiKey) {
                output.env.HONCHO_API_KEY = handle.config.apiKey;
            }
            output.env.HONCHO_URL = handle.config.baseUrl;
            output.env.HONCHO_WORKSPACE_ID = handle.workspaceId;
        },
        "chat.message": async (input, output) => {
            const message = extractText(output.parts);
            if (!message || message.startsWith("/")) {
                return;
            }
            await withRuntime(input, async (runtime) => {
                const state = getState(runtime.sessionId);
                state.promptCount += 1;
                await captureMessage(runtime, runtime.userPeer, message, {
                    source: "chat.message",
                    sessionId: runtime.sessionId,
                });
                if (runtime.config.writeFrequency === "async" || runtime.config.writeFrequency === "turn") {
                    const candidate = durableConclusionCandidate(message, runtime.config);
                    if (candidate) {
                        await maybeWriteConclusion(runtime, candidate, "chat.message");
                    }
                }
            }, undefined);
        },
        "experimental.chat.system.transform": async (input, output) => {
            const handle = await deriveRuntimeHandle(pluginInput, input, configPath);
            if (!handle.config.enabled || handle.config.recallMode === "tools" || !hasConfiguredAuth(handle.config)) {
                return;
            }
            const query = extractPromptQuery(input);
            if (shouldSkipContextRetrieval(query, handle.config.contextRefresh)) {
                return;
            }
            await withRuntime(input, async (runtime) => {
                const state = getState(runtime.sessionId);
                if (!state.stableContext) {
                    await hydrateSessionStartContext(runtime, state);
                }
                const promptContext = runtime.config.recallMode === "context" || runtime.config.recallMode === "hybrid"
                    ? await refreshPromptContext(runtime, state, query)
                    : null;
                const compiledSections = [state.stableContext, promptContext].filter((value) => Boolean(value && value.trim()));
                if (compiledSections.length === 0) {
                    return;
                }
                const compiled = compiledSections.join("\n\n");
                state.lastInjectedContext = compiled;
                output.system = output.system || [];
                output.system.push(`## Honcho Memory\nUse this as persistent project and user memory. Prefer it over guessing, but only mention it when relevant to the current task.\n\n${compiled}`);
            }, undefined);
        },
        "experimental.session.compacting": async (input, output) => {
            const handle = await deriveRuntimeHandle(pluginInput, input, configPath);
            const state = getState(handle.sessionId);
            output.context = output.context || [];
            output.context.push([
                "## Honcho Continuity",
                `Workspace: ${handle.workspaceId}`,
                `Session key: ${handle.sessionKey}`,
                `Recall mode: ${handle.config.recallMode}`,
                `Peer model: ${handle.config.peerModel}`,
                `Write frequency: ${handle.config.writeFrequency}`,
                `User peer: ${handle.userPeerId} (observeMe=true, observeOthers=false)`,
                `Root agent peer: ${handle.rootAgentPeerId} (observeMe=true, observeOthers=true)`,
                handle.childAgentPeerId
                    ? `Child agent peer: ${handle.childAgentPeerId} (observeMe=true, observeOthers=false, sessionScoped=true)`
                    : "Child agent peer: none",
                handle.parentAgentObserverPeerId
                    ? `Parent observer peer: ${handle.parentAgentObserverPeerId} (observeMe=false, observeOthers=true, modelsOnly=${handle.childAgentPeerId || "none"})`
                    : "Parent observer peer: none",
                state.lastInjectedContext ? `Last injected memory:\n${state.lastInjectedContext}` : "Last injected memory: none",
                state.recentConclusions.length > 0
                    ? `Recent durable conclusions:\n- ${state.recentConclusions.join("\n- ")}`
                    : "Recent durable conclusions: none",
            ].join("\n"));
        },
        "tool.execute.before": async (_input, output) => {
            output.args = output.args;
        },
        "tool.execute.after": async (input, output) => {
            await withRuntime(input, async (runtime) => {
                const toolName = typeof input.tool === "string" ? input.tool : "unknown-tool";
                const resultText = typeof output.output === "string" ? output.output : "";
                if (!resultText.trim()) {
                    return;
                }
                await captureMessage(runtime, runtime.agentPeer, `${toolName} result: ${clampText(resultText.trim(), 1200)}`, {
                    source: "tool.execute.after",
                    tool: toolName,
                });
                if (runtime.config.writeFrequency === "async" && toolName.startsWith("honcho_")) {
                    const candidate = durableConclusionCandidate(resultText, runtime.config);
                    if (candidate) {
                        await maybeWriteConclusion(runtime, candidate, "tool.execute.after");
                    }
                }
            }, undefined);
        },
        tool: {
            honcho_get_config: tool({
                description: "Get the persisted and effective OpenCode Honcho settings, including workspace, peers, and session mapping.",
                args: { field: tool.schema.string().optional() },
                async execute(args, context) {
                    const status = await runtimeStatus({ ...args, sessionID: context.sessionID });
                    if (args.field) {
                        return JSON.stringify({ field: args.field, value: lookupField(status, args.field) }, null, 2);
                    }
                    return JSON.stringify(status, null, 2);
                },
            }),
            honcho_setup: tool({
                description: "Validate Honcho setup for OpenCode and persist shared Honcho credentials or a localhost baseUrl to ~/.config/opencode/honcho.json for all future projects when provided.",
                args: {
                    apiKey: tool.schema.string().optional(),
                    baseUrl: tool.schema.string().optional(),
                    persistGlobal: tool.schema.boolean().optional(),
                },
                async execute(args, context) {
                    const handle = await deriveRuntimeHandle(pluginInput, { sessionID: context.sessionID }, configPath);
                    const shouldPersistGlobal = args.persistGlobal !== false;
                    const globalPersisted = await readConfigFile(handle.globalConfigPath);
                    const nextGlobal = { ...globalPersisted };
                    const nextHosts = isRecord(nextGlobal.hosts) ? { ...nextGlobal.hosts } : {};
                    const nextHostEntry = hostScopedSettings(nextHosts.opencode) ?? {
                        workspace: "opencode",
                        aiPeer: "opencode",
                        linkedHosts: [],
                    };
                    const providedApiKey = typeof args.apiKey === "string" ? args.apiKey.trim() : "";
                    const providedBaseUrl = typeof args.baseUrl === "string" ? args.baseUrl.trim() : "";
                    const effectiveApiKey = providedApiKey || handle.config.apiKey || "";
                    const persistedFields = [];
                    if (shouldPersistGlobal) {
                        nextGlobal.globalOverride = nextGlobal.globalOverride === true;
                        if (effectiveApiKey) {
                            setSettingValue(nextGlobal, "apiKey", effectiveApiKey);
                            persistedFields.push("apiKey");
                        }
                        if (providedBaseUrl) {
                            setSettingValue(nextGlobal, "baseUrl", providedBaseUrl);
                            persistedFields.push("baseUrl");
                        }
                        nextHosts.opencode = nextHostEntry;
                        nextGlobal.hosts = nextHosts;
                        if (persistedFields.length > 0) {
                            await writeSettings(handle.globalConfigPath, nextGlobal);
                        }
                        else if (!isRecord(globalPersisted.hosts) || !isRecord(globalPersisted.hosts.opencode)) {
                            await writeSettings(handle.globalConfigPath, nextGlobal);
                        }
                    }
                    return JSON.stringify({
                        ok: Boolean(effectiveApiKey) || isLocalBaseUrl(providedBaseUrl || handle.config.baseUrl),
                        globalConfigPath: handle.globalConfigPath,
                        persistedFields,
                        message: effectiveApiKey
                            ? "Honcho setup is ready."
                            : isLocalBaseUrl(providedBaseUrl || handle.config.baseUrl)
                                ? "Honcho setup is ready for local mode."
                                : "No Honcho API key is configured. Pass one to /honcho:setup <key> or set HONCHO_API_KEY before running setup. For a local Honcho instance, set baseUrl to http://127.0.0.1:8000 or http://localhost:8000.",
                        status: await runtimeStatus({ sessionID: context.sessionID }),
                    }, null, 2);
                },
            }),
            honcho_status: tool({
                description: "Show effective Honcho status for this OpenCode project, including workspace, peers, sessions, and memory mode.",
                args: {},
                async execute(_args, context) {
                    return JSON.stringify(await runtimeStatus({ sessionID: context.sessionID }), null, 2);
                },
            }),
            honcho_set_config: tool({
                description: "Persist a Honcho setting to .opencode/honcho.json for all future OpenCode sessions in this project.",
                args: {
                    field: tool.schema.string(),
                    value: tool.schema.string(),
                    confirm: tool.schema.boolean().optional(),
                },
                async execute(args, context) {
                    const handle = await deriveRuntimeHandle(pluginInput, { sessionID: context.sessionID }, configPath);
                    let field;
                    try {
                        field = parseSettingField(args.field);
                    }
                    catch (error) {
                        return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2);
                    }
                    const persisted = await readConfigFile(handle.configPath);
                    const nextPersisted = { ...persisted };
                    const nextValue = parseSettingValue(field, args.value);
                    setSettingValue(nextPersisted, field, nextValue);
                    await writeSettings(handle.configPath, nextPersisted);
                    return JSON.stringify({
                        ok: true,
                        configPath: handle.configPath,
                        field,
                        value: nextValue,
                        status: await runtimeStatus({ sessionID: context.sessionID }),
                    }, null, 2);
                },
            }),
            honcho_search: tool({
                description: "Search Honcho session memory for this OpenCode project using the derived workspace and session mapping.",
                args: {
                    query: tool.schema.string(),
                    max_items: tool.schema.number().optional(),
                },
                async execute(args, context) {
                    return JSON.stringify(await withRuntime({ ...args, sessionID: context.sessionID }, async (runtime) => {
                        const messages = await runtime.session.search(args.query, {
                            limit: args.max_items ?? 5,
                        });
                        return {
                            ok: true,
                            workspace: runtime.workspaceId,
                            sessionKey: runtime.sessionKey,
                            items: messages.map((message) => ({
                                id: message.id,
                                peerId: message.peerId,
                                content: message.content,
                            })),
                        };
                    }, { ok: false, items: [], error: "Honcho is unavailable for search." }), null, 2);
                },
            }),
            honcho_chat: tool({
                description: "Ask Honcho for a reasoning-backed answer about this project using the current peer and session mapping.",
                args: { query: tool.schema.string() },
                async execute(args, context) {
                    return JSON.stringify(await withRuntime({ ...args, sessionID: context.sessionID }, async (runtime) => ({
                        ok: true,
                        workspace: runtime.workspaceId,
                        sessionKey: runtime.sessionKey,
                        response: (await runtime.agentPeer.chat(args.query, {
                            target: runtime.userPeer,
                            session: runtime.session,
                            reasoningLevel: runtime.config.dialecticReasoningLevel,
                        })) ?? "",
                    }), { ok: false, response: null, error: "Honcho is unavailable for chat." }), null, 2);
                },
            }),
            honcho_create_conclusion: tool({
                description: "Create a durable Honcho memory for this OpenCode project using the current peer and session mapping.",
                args: { content: tool.schema.string() },
                async execute(args, context) {
                    return JSON.stringify(await withRuntime({ ...args, sessionID: context.sessionID }, async (runtime) => {
                        const content = clampText(args.content.trim(), runtime.config.dialecticMaxChars);
                        const created = await maybeWriteConclusion(runtime, content, "tool.create_conclusion");
                        return {
                            ok: created,
                            workspace: runtime.workspaceId,
                            sessionKey: runtime.sessionKey,
                            content,
                        };
                    }, { ok: false, error: "Honcho is unavailable for durable writes." }), null, 2);
                },
            }),
        },
    };
};
export const HonchoRuntimePlugin = createHonchoRuntimePlugin();
export const __testing = {
    buildPeerTopology,
    normalizeId,
};
export default HonchoRuntimePlugin;
