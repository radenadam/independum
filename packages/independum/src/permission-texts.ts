import { defineText, type ModelText } from "./model-texts.ts";

const reasonSlot = {
  reason: { meaning: "The exact reason that the call cannot run.", example: "The policy changed." },
};

/** Editable permission outcomes sent before any operation runs. */
export const permissionTexts: Record<
  "denied" | "required" | "invalidated" | "unavailable" | "rule" | "resource",
  ModelText
> = {
  resource: defineText({
    id: "permissions.resource",
    group: "Permissions",
    section: "result",
    label: "When a requested resource cannot be granted",
    builtIn: "The requested resource cannot be granted: {reason} No tool operation ran.",
    slots: reasonSlot,
  }),
  denied: defineText({
    id: "permissions.denied",
    group: "Permissions",
    section: "result",
    label: "When the user denies a call",
    builtIn: "The user denied this call. No tool operation ran.",
    slots: {},
  }),
  required: defineText({
    id: "permissions.required",
    group: "Permissions",
    section: "result",
    label: "When a headless call needs approval",
    builtIn: "This call needs user approval. No tool operation ran.",
    slots: {},
  }),
  invalidated: defineText({
    id: "permissions.invalidated",
    group: "Permissions",
    section: "result",
    label: "When the authorization changes",
    builtIn: "The approval is no longer valid because {reason} No tool operation ran.",
    slots: reasonSlot,
  }),
  unavailable: defineText({
    id: "permissions.unavailable",
    group: "Permissions",
    section: "result",
    label: "When the sandbox cannot enforce the boundary",
    builtIn: "The required sandbox is unavailable: {reason} No tool operation ran.",
    slots: reasonSlot,
  }),
  rule: defineText({
    id: "permissions.rule",
    group: "Permissions",
    section: "result",
    label: "When a rule denies a call",
    builtIn: "Permission rules deny this call: {reason} No tool operation ran.",
    slots: reasonSlot,
  }),
};

/** The permission result texts in their editing order. */
export const permissionTextList: ModelText[] = Object.values(permissionTexts);
