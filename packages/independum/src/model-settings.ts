import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type {
  ModelOverrideChange,
  ModelOverrides,
  ModelSettingsSummary,
  Settings,
} from "./api-types.ts";

type Model = NonNullable<ReturnType<ModelRuntime["getModel"]>>;

/** Returns the settings of a model with the values that Pi knows before any edit. */
export function modelSettingsOf(
  model: Model,
  overrides: ModelOverrides = {},
): ModelSettingsSummary {
  const temperature = model.samplingParams?.temperature;
  const builtIn = {
    contextWindow: model.contextWindow,
    maxOutput: model.maxTokens,
    temperature:
      typeof temperature === "number" && Number.isFinite(temperature) ? temperature : null,
  };
  return {
    providerId: model.provider,
    modelId: model.id,
    builtIn,
    overrides: Object.fromEntries(
      Object.entries(overrides).filter(
        ([key, value]) => value !== builtIn[key as keyof typeof builtIn],
      ),
    ),
  };
}

/** Returns a model with the context and output limits of the user, without changing its catalog entry. */
export function applyModelOverrides(model: Model, overrides: ModelOverrides): Model {
  return {
    ...model,
    contextWindow: overrides.contextWindow ?? model.contextWindow,
    maxTokens: overrides.maxOutput ?? model.maxTokens,
  };
}

/** Applies each model change and drops values that equal the built-in value. */
export function changeModelOverrides(
  models: ModelRuntime,
  saved: Settings["modelOverrides"],
  changes: Record<string, Record<string, ModelOverrideChange | null>>,
): Settings["modelOverrides"] | undefined {
  const next = new Map(Object.entries(saved));
  for (const [provider, entries] of Object.entries(changes)) {
    const updated = new Map(Object.entries(next.get(provider) ?? {}));
    for (const [id, change] of Object.entries(entries)) {
      const model = models.getModel(provider, id);
      if (model === undefined) {
        return undefined;
      }
      const builtIn = modelSettingsOf(model).builtIn;
      const overrides = new Map(Object.entries(change === null ? {} : (updated.get(id) ?? {})));
      for (const [key, value] of Object.entries(change ?? {})) {
        if (value === null || value === builtIn[key as keyof typeof builtIn]) {
          overrides.delete(key);
        } else {
          overrides.set(key, value);
        }
      }
      if (overrides.size === 0) {
        updated.delete(id);
      } else {
        updated.set(id, Object.fromEntries(overrides));
      }
    }
    if (updated.size === 0) {
      next.delete(provider);
    } else {
      next.set(provider, Object.fromEntries(updated));
    }
  }
  return Object.fromEntries(next);
}
