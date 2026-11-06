import { expect, test } from "vitest";
import { commandEnvironment, minimalEnvironmentNames } from "./command-environment.ts";

test("minimal environments keep exactly the published names and no injection variables", () => {
  const inherited = Object.fromEntries(
    [
      ...minimalEnvironmentNames,
      "NODE_OPTIONS",
      "BASH_ENV",
      "ENV",
      "LD_PRELOAD",
      "DYLD_INSERT_LIBRARIES",
      "PRIVATE_KEY",
      "INDEPENDUM_ACCESS_TOKEN",
    ].map((name) => [name, name]),
  );
  expect(Object.keys(commandEnvironment("minimal", {}, inherited)).sort()).toEqual(
    [...minimalEnvironmentNames].sort(),
  );
});

test("explicit variables apply after inheritance and the access token is removed last", () => {
  // biome-ignore-start lint/style/useNamingConvention: Shells name environment variables in capitals.
  const variables = {
    PATH: "original",
    PRIVATE_KEY: "inherited",
    INDEPENDUM_ACCESS_TOKEN: "never",
  };
  const overrides = {
    PATH: "explicit",
    ADDED: "supplied",
    INDEPENDUM_ACCESS_TOKEN: "still removed",
  };
  const minimal = commandEnvironment("minimal", overrides, variables);
  expect(minimal).toEqual({ PATH: "explicit", ADDED: "supplied" });
  expect(commandEnvironment("inherit", overrides, variables)).toEqual({
    ...minimal,
    PRIVATE_KEY: "inherited",
  });
  // biome-ignore-end lint/style/useNamingConvention: Shells name environment variables in capitals.
});
