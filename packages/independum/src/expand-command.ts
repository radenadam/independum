/** Parses quoted command arguments without interpreting backslashes. */
export function parseCommandArguments(source: string): string[] {
  const argumentsList: string[] = [];
  let current = "";
  let quote = "";
  let hasArgument = false;
  for (const character of source) {
    if (quote !== "") {
      if (character === quote) {
        quote = "";
      } else {
        current += character;
      }
      hasArgument = true;
    } else if (character === '"' || character === "'") {
      quote = character;
      hasArgument = true;
    } else if (/\s/.test(character)) {
      if (hasArgument) {
        argumentsList.push(current);
      }
      current = "";
      hasArgument = false;
    } else {
      current += character;
      hasArgument = true;
    }
  }
  if (quote !== "") {
    throw new Error("A command argument has an unmatched quote.");
  }
  if (hasArgument) {
    argumentsList.push(current);
  }
  return argumentsList;
}

/** Expands positional arguments, defaults, and slices exactly once. */
export function expandCommand(body: string, source: string): string {
  const argumentsList = parseCommandArguments(source);
  const all = argumentsList.join(" ");
  return body.replace(
    /\$\$|\$\{([1-9]\d*|ARGUMENTS|@):-([^}]*)\}|\$\{@:([1-9]\d*)(?::(\d+))?\}|\$(ARGUMENTS|@|[1-9]\d*)/g,
    (
      whole,
      fallbackTarget: string | undefined,
      fallback: string,
      start: string | undefined,
      length: string | undefined,
      simple: string | undefined,
    ) => {
      if (whole === "$$") {
        return whole;
      }
      if (fallbackTarget !== undefined) {
        return (
          (fallbackTarget === "@" || fallbackTarget === "ARGUMENTS"
            ? all
            : argumentsList[Number(fallbackTarget) - 1]) || fallback
        );
      }
      if (start !== undefined) {
        return argumentsList
          .slice(
            Number(start) - 1,
            length === undefined ? undefined : Number(start) - 1 + Number(length),
          )
          .join(" ");
      }
      return simple === "@" || simple === "ARGUMENTS"
        ? all
        : (argumentsList[Number(simple) - 1] ?? "");
    },
  );
}
