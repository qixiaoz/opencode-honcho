type InitializeProjectOptions = {
    rootDir?: string;
    packageName?: string;
    force?: boolean;
};
type InitializeProjectResult = {
    rootDir: string;
    createdPaths: string[];
    skippedPaths: string[];
};
export declare const initializeProject: ({ rootDir, packageName, force, }?: InitializeProjectOptions) => Promise<InitializeProjectResult>;
export declare const scaffoldTemplates: {
    DEFAULT_PACKAGE_NAME: string;
    opencodeCommands: () => {
        "honcho:setup": {
            description: string;
            template: string;
        };
        "honcho:status": {
            description: string;
            template: string;
        };
        "honcho:settings": {
            description: string;
            template: string;
        };
        "honcho:set": {
            description: string;
            template: string;
        };
        "honcho:unset": {
            description: string;
            template: string;
        };
        "honcho:mode": {
            description: string;
            template: string;
        };
        "honcho:write": {
            description: string;
            template: string;
        };
        "honcho:interview": {
            description: string;
            template: string;
        };
    };
    opencodeManifest: () => string;
    pluginShim: (packageName: string) => string;
    projectOverrideJson: () => string;
};
export {};
