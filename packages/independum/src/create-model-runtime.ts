import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

/** Creates the Pi model runtime that keeps logins and model settings in the given folder. */
export function createModelRuntime(directory: string): Promise<ModelRuntime> {
  return ModelRuntime.create({
    authPath: join(directory, "auth.json"),
    modelsPath: join(directory, "models.json"),
  });
}
