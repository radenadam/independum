import "vitest";

declare module "vitest" {
  interface TaskMeta {
    skipReason?: string;
  }
}
