import { type Plugin } from "@opencode-ai/plugin";
type RecallMode = "hybrid" | "context" | "tools";
type ObservationMode = "directional" | "unified";
type SessionStrategy = "per-repo" | "per-directory" | "per-session" | "global";
type DialecticReasoningLevel = "minimal" | "low" | "medium" | "high" | "max";
type WriteFrequency = "async" | "turn" | "session" | number;
type ContextRefreshSettings = {
    messageThreshold: number;
    ttlSeconds: number;
    skipTrivialPrompts: boolean;
    useSessionStartDialectic: boolean;
};
export type RuntimePluginOptions = {
    configPath?: string;
};
type HonchoSettings = {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    peerName: string;
    aiPeer: string;
    workspace: string;
    globalOverride: boolean;
    linkedHosts: string[];
    recallMode: RecallMode;
    observation: ObservationMode;
    writeFrequency: WriteFrequency;
    sessionStrategy: SessionStrategy;
    dialecticReasoningLevel: DialecticReasoningLevel;
    dialecticDynamic: boolean;
    dialecticMaxChars: number;
    messageMaxChars: number;
    saveMessages: boolean;
    contextRefresh: ContextRefreshSettings;
};
type RuntimeHandle = {
    rootDir: string;
    configPath: string;
    globalConfigPath: string;
    config: HonchoSettings;
    workspaceId: string;
    sessionId: string;
    sessionKey: string;
    userPeerId: string;
    rootAgentPeerId: string;
    activeAgentPeerId: string;
    childAgentPeerId: string | null;
    parentAgentObserverPeerId: string | null;
};
type PeerDescription = {
    id: string;
    observeMe: boolean;
    observeOthers: boolean;
    sessionScoped?: boolean;
    modelsOnly?: string[];
};
type PeerTopology = {
    sessionPeerConfigs: Record<string, {
        observeMe: boolean;
        observeOthers: boolean;
    }>;
    describedPeers: {
        userPeer: PeerDescription;
        rootAgentPeer: PeerDescription;
        childAgentPeer: PeerDescription | null;
        parentAgentObserverPeer: PeerDescription | null;
    };
};
export declare const createHonchoRuntimePlugin: ({ configPath }?: RuntimePluginOptions) => Plugin;
export declare const HonchoRuntimePlugin: Plugin;
export declare const __testing: {
    buildPeerTopology: (handle: Pick<RuntimeHandle, "userPeerId" | "rootAgentPeerId" | "activeAgentPeerId" | "childAgentPeerId" | "parentAgentObserverPeerId">) => PeerTopology;
};
export default HonchoRuntimePlugin;
