import { basename } from "node:path";
import {
  type BindingPattern,
  type BindingRestElement,
  type Expression,
  type ParamPattern,
  parseSync,
  Visitor,
} from "oxc-parser";

/** Returns violations of the code rules that syntax can identify. */
export function findCodeProblems(file: string, code: string): string[] {
  const parsed = parseSync(file, code);
  const problems: string[] = [];
  const functions = new Set<string>();
  const declarations = new Map<string, Expression>();
  const styles: Expression[] = [];
  const sandboxOperations = new Set<string>();

  function report(node: { start: number }, message: string): void {
    const line = code.slice(0, node.start).split("\n").length;
    problems.push(`${file}:${line}: ${message}`);
  }

  function checkError(node: Expression): void {
    const value = literalStart(node);
    if (value !== undefined && /^[a-z]/.test(value)) {
      report(node, "Error messages start with a capital letter.");
    }
    const ending = node.type === "TemplateLiteral" ? node.quasis.at(-1)?.value.cooked : value;
    if (ending !== undefined && ending !== null && ending !== "" && !ending.endsWith(".")) {
      report(node, "Error messages end with a period.");
    }
  }

  function checkBinding(node: BindingPattern | ParamPattern | BindingRestElement): void {
    if (node.type === "Identifier" && node.name === "cwd") {
      report(node, "Internal names use full words. Use folder instead of cwd.");
    } else if (node.type === "ObjectPattern") {
      for (const property of node.properties) {
        checkBinding(property.type === "Property" ? property.value : property.argument);
      }
    } else if (node.type === "ArrayPattern") {
      for (const element of node.elements) {
        if (element !== null) {
          checkBinding(element);
        }
      }
    } else if (node.type === "AssignmentPattern") {
      checkBinding(node.left);
    } else if (node.type === "RestElement") {
      checkBinding(node.argument);
    } else if (node.type === "TSParameterProperty") {
      checkBinding(node.parameter);
    }
  }

  function checkParameters(node: { params: ParamPattern[] }): void {
    for (const parameter of node.params) {
      checkBinding(parameter);
    }
  }

  function checkStyle(expression: Expression, seen = new Set<string>()): void {
    const value = unwrap(expression);
    if (value.type === "Identifier" && !seen.has(value.name)) {
      seen.add(value.name);
      const declaration = declarations.get(value.name);
      if (declaration !== undefined) {
        checkStyle(declaration, seen);
      }
    } else if (value.type === "ObjectExpression") {
      for (const property of value.properties) {
        if (
          property.type !== "Property" ||
          property.key.type !== "Literal" ||
          typeof property.key.value !== "string" ||
          !property.key.value.startsWith("--")
        ) {
          report(property, "Inline styles only pass custom properties to a CSS module.");
        }
      }
    }
  }

  // biome-ignore-start lint/style/useNamingConvention: Oxc names its syntax visitors.
  new Visitor({
    ImportDeclaration(node) {
      const source = node.source.value;
      if (source.startsWith("@microsoft/mxc-sdk")) {
        if (source !== "@microsoft/mxc-sdk/v1") {
          report(node, "Sandbox imports use only the stable MXC V1 API.");
        }
        if (
          !file.endsWith("create-sandbox.ts") &&
          !file.endsWith(".test.ts") &&
          node.importKind !== "type"
        ) {
          report(node, "Native sandbox access belongs to create-sandbox.ts.");
        }
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            report(node, "Sandbox APIs use named imports so operation options are checked.");
          } else {
            const name =
              specifier.imported.type === "Identifier"
                ? specifier.imported.name
                : specifier.imported.value;
            if (
              [
                "spawn",
                "run",
                "spawnWithPty",
                "provisionContainer",
                "startContainer",
                "spawnInContainer",
                "spawnInContainerWithPty",
                "runInContainer",
                "stopContainer",
                "deprovisionContainer",
              ].includes(name)
            ) {
              sandboxOperations.add(specifier.local.name);
            }
          }
        }
      }
    },
    VariableDeclarator(node) {
      checkBinding(node.id);
      if (node.init !== null) {
        if (node.id.type === "Identifier") {
          declarations.set(node.id.name, node.init);
        }
        if (["ArrowFunctionExpression", "FunctionExpression"].includes(unwrap(node.init).type)) {
          report(node, "Named functions use function declarations. Arrows are for callbacks only.");
        }
      }
    },
    FunctionDeclaration: checkParameters,
    FunctionExpression: checkParameters,
    ArrowFunctionExpression: checkParameters,
    TSPropertySignature(node) {
      if (node.key.type === "Identifier" && node.key.name === "cwd") {
        report(node, "Internal names use full words. Use folder instead of cwd.");
      }
    },
    ExportNamedDeclaration(node) {
      if (node.declaration?.type === "FunctionDeclaration" && node.declaration.id !== null) {
        functions.add(node.declaration.id.name);
      }
      for (const specifier of node.specifiers) {
        if (
          node.exportKind !== "type" &&
          specifier.exportKind !== "type" &&
          parsed.program.body.some(
            (statement) =>
              statement.type === "FunctionDeclaration" &&
              statement.id?.name ===
                (specifier.local.type === "Identifier"
                  ? specifier.local.name
                  : specifier.local.value),
          )
        ) {
          functions.add(
            specifier.exported.type === "Identifier"
              ? specifier.exported.name
              : String(specifier.exported.value),
          );
        }
      }
    },
    AssignmentExpression(node) {
      if (["ArrowFunctionExpression", "FunctionExpression"].includes(unwrap(node.right).type)) {
        report(node, "Named functions use function declarations. Arrows are for callbacks only.");
      }
      if (
        isStyle(node.left) ||
        (node.left.type === "MemberExpression" && isStyle(node.left.object))
      ) {
        report(node, "Inline styles only pass custom properties to a CSS module.");
      }
    },
    CallExpression(node) {
      const argument = node.arguments[0];
      if (node.callee.type === "Identifier" && sandboxOperations.has(node.callee.name)) {
        const options = node.arguments[1];
        const telemetry =
          options === undefined || options.type === "SpreadElement"
            ? undefined
            : objectField(options, "telemetry");
        const enabled = telemetry === undefined ? undefined : objectField(telemetry, "enabled");
        if (enabled?.type !== "Literal" || enabled.value !== false) {
          report(node, "Sandbox operations explicitly disable telemetry.");
        }
      }
      if (
        isTestCall(node.callee) &&
        argument?.type === "Literal" &&
        typeof argument.value === "string" &&
        (/[A-Z]/.test(argument.value.replace(/\$[\w.]+|%[a-zA-Z]/g, "")) ||
          argument.value.endsWith("."))
      ) {
        report(argument, "Test names are lowercase phrases without a final period.");
      }
      if (
        node.callee.type === "Identifier" &&
        node.callee.name === "defineText" &&
        argument?.type === "ObjectExpression"
      ) {
        for (const property of argument.properties) {
          if (
            property.type === "Property" &&
            property.key.type === "Identifier" &&
            property.key.name === "builtIn"
          ) {
            const value = literalStart(property.value);
            if (value !== undefined && /^[a-z]/.test(value) && value.endsWith(".")) {
              checkError(property.value);
            }
          }
        }
      }
      if (
        node.callee.type === "MemberExpression" &&
        isStyle(node.callee.object) &&
        node.callee.property.type === "Identifier" &&
        ["setProperty", "removeProperty"].includes(node.callee.property.name) &&
        (argument?.type !== "Literal" ||
          typeof argument.value !== "string" ||
          !argument.value.startsWith("--"))
      ) {
        report(node, "Inline styles only pass custom properties to a CSS module.");
      }
    },
    NewExpression(node) {
      const message = node.arguments[0];
      if (
        node.callee.type === "Identifier" &&
        /Error$/.test(node.callee.name) &&
        message !== undefined &&
        message.type !== "SpreadElement"
      ) {
        checkError(message);
      }
    },
    JSXAttribute(node) {
      if (
        node.name.type === "JSXIdentifier" &&
        node.name.name === "style" &&
        node.value?.type === "JSXExpressionContainer" &&
        node.value.expression.type !== "JSXEmptyExpression"
      ) {
        styles.push(node.value.expression);
      }
    },
  }).visit(parsed.program);
  // biome-ignore-end lint/style/useNamingConvention: Oxc names its syntax visitors.
  for (const expression of styles) {
    checkStyle(expression);
  }
  const [name] = functions;
  if (functions.size === 1 && name !== undefined) {
    const expected =
      name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase() +
      (file.endsWith(".tsx") ? ".tsx" : ".ts");
    if (basename(file) !== expected) {
      problems.push(`${file}: A file with one exported function is named ${expected}.`);
    }
  }
  return problems;
}

function objectField(expression: Expression, name: string): Expression | undefined {
  const object = unwrap(expression);
  if (
    object.type !== "ObjectExpression" ||
    object.properties.some((property) => property.type === "SpreadElement")
  ) {
    return undefined;
  }
  const property = object.properties.find(
    (property) =>
      property.type === "Property" &&
      (property.key.type === "Identifier"
        ? property.key.name
        : property.key.type === "Literal"
          ? property.key.value
          : undefined) === name,
  );
  return property?.type === "Property" ? property.value : undefined;
}

function unwrap(expression: Expression): Expression {
  return expression.type === "TSAsExpression" ||
    expression.type === "TSSatisfiesExpression" ||
    expression.type === "ParenthesizedExpression"
    ? unwrap(expression.expression)
    : expression;
}

function isStyle(node: { type: string }): boolean {
  return (
    node.type === "MemberExpression" &&
    "property" in node &&
    ((node.property as { name?: string }).name === "style" ||
      (node.property as { value?: string }).value === "style")
  );
}

function isTestCall(node: Expression): boolean {
  if (node.type === "Identifier") {
    return node.name === "test";
  }
  if (node.type === "MemberExpression") {
    return isTestCall(node.object);
  }
  return node.type === "CallExpression" && isTestCall(node.callee);
}

function literalStart(node: Expression): string | undefined {
  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : node.type === "TemplateLiteral"
      ? (node.quasis[0]?.value.cooked ?? undefined)
      : undefined;
}
