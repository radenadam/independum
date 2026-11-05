import { parseSync, Visitor } from "oxc-parser";

/** Returns numeric ranges that repeat a definition in another file. */
export function findDuplicateRanges(sources: { file: string; code: string }[]): string[] {
  const definitions = new Map<string, string>();
  const problems: string[] = [];
  for (const { file, code } of sources) {
    // biome-ignore-start lint/style/useNamingConvention: Oxc names its syntax visitors.
    new Visitor({
      ObjectExpression(node) {
        const values = new Map<string, number>();
        for (const property of node.properties) {
          if (
            property.type === "Property" &&
            property.key.type === "Identifier" &&
            property.value.type === "Literal" &&
            typeof property.value.value === "number"
          ) {
            values.set(property.key.name, property.value.value);
          }
        }
        if (node.properties.length !== 2 || !values.has("min") || !values.has("max")) {
          return;
        }
        const key = `${values.get("min")}:${values.get("max")}`;
        const previous = definitions.get(key);
        const line = code.slice(0, node.start).split("\n").length;
        if (previous !== undefined && !previous.startsWith(`${file}:`)) {
          problems.push(
            `${file}:${line}: Range duplicates ${previous}. Import its definition instead.`,
          );
        } else {
          definitions.set(key, `${file}:${line}`);
        }
      },
    }).visit(parseSync(file, code).program);
    // biome-ignore-end lint/style/useNamingConvention: Oxc names its syntax visitors.
  }
  return problems;
}
