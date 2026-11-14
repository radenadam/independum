import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { privateRuntime } from "./private-runtime.ts";

/** Creates the Pi model runtime that keeps logins and model settings in the given folder. */
export function createModelRuntime(directory: string): Promise<ModelRuntime> {
  const privateFolder = privateRuntime(directory);
  return ModelRuntime.create({
    authPath: join(privateFolder, "auth.json"),
    modelsPath: join(privateFolder, "models.json"),
  });
}
