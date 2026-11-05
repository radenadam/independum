import type { ModelSummary } from "independum/api-types";

/**
 * Returns the name of a model as the header and the model picker show it, or its id when the list of
 * models no longer has it.
 */
export function modelNameOf(
  models: ModelSummary[] | undefined,
  providerId: string,
  id: string,
): string {
  return models?.find((each) => each.providerId === providerId && each.id === id)?.name ?? id;
}
