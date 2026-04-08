import { type Plugin } from "@opencode-ai/plugin";
export type RuntimePluginOptions = {
    configPath?: string;
};
export declare const createHonchoRuntimePlugin: ({ configPath }?: RuntimePluginOptions) => Plugin;
export declare const HonchoRuntimePlugin: Plugin;
export default HonchoRuntimePlugin;
