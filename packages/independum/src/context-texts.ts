import { defineText, type ModelText } from "./model-texts.ts";

const pathSlot = { meaning: "The absolute source path.", example: "/project/AGENTS.md" };
const contentSlot = { meaning: "The exact source content.", example: "Project facts." };

export const instructionText: ModelText<"path" | "content"> = defineText({
  id: "context.instructions",
  group: "Project instructions",
  section: "prompt",
  label: "Each instruction file",
  builtIn: '<project_instructions path="{path}">\n{content}\n</project_instructions>',
  slots: { path: pathSlot, content: contentSlot },
});
export const skillText: ModelText<"name" | "path" | "directory" | "description"> = defineText({
  id: "context.skill",
  group: "Skills",
  section: "prompt",
  label: "Each advertised skill",
  builtIn: '<skill name="{name}" path="{path}" directory="{directory}">\n{description}\n</skill>',
  slots: {
    name: { meaning: "The skill name.", example: "review" },
    path: pathSlot,
    directory: pathSlot,
    description: contentSlot,
  },
});
export const skillCatalogText: ModelText<"content"> = defineText({
  id: "context.skills",
  group: "Skills",
  section: "prompt",
  label: "Skill advertisement",
  builtIn: "<available_skills>\n{content}\n</available_skills>",
  slots: { content: contentSlot },
});
export const skillInvocationText: ModelText<"name" | "path" | "directory" | "content"> = defineText(
  {
    ...skillText,
    id: "context.skillInvocation",
    label: "Explicit skill invocation",
    builtIn: '<skill name="{name}" path="{path}" directory="{directory}">\n{content}\n</skill>',
    slots: {
      name: skillText.slots.name,
      path: pathSlot,
      directory: pathSlot,
      content: contentSlot,
    },
  },
);
export const contextTexts: ModelText[] = [
  instructionText,
  skillText,
  skillCatalogText,
  skillInvocationText,
];
