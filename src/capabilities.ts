export const HOST_CAPABILITIES = {
  hard_command_interception: "unsupported",
  pre_model_command_execute: "supported",
  structured_question_ui: "unsupported",
  persistent_background_runtime: "unsupported",
} as const

export const HOST_CAPABILITIES_VERSION = "1"

export type HostCapabilityStatus = (typeof HOST_CAPABILITIES)[keyof typeof HOST_CAPABILITIES]
