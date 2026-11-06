import type { DependencyList, EffectCallback, ReactElement, ReactNode } from "react";
import { vi } from "vitest";

interface Effect {
  dependencies: DependencyList | undefined;
  cleanup: ReturnType<EffectCallback>;
}

interface RenderScope {
  values: unknown[];
  effects: Map<number, Effect>;
  pending: (() => void)[];
  index: number;
  hasChanged: boolean;
}

interface HookRender<Data> {
  render: () => Data;
  unmount: () => void;
}

let active: RenderScope | undefined;

/** Finds an element in the output of a component without mounting its children. */
export function findElement<Props>(
  tree: ReactNode,
  matches: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Props> {
  const pending = [tree];
  while (pending.length > 0) {
    const node = pending.shift();
    if (Array.isArray(node)) {
      pending.push(...node);
    } else if (node !== null && typeof node === "object" && "props" in node) {
      const element = node as ReactElement<Record<string, unknown>>;
      if (matches(element)) {
        return element as ReactElement<Props>;
      }
      pending.push(element.props.children as ReactNode);
    }
  }
  throw new Error("The component does not contain that element.");
}

/** Clicks a labeled action in the output of a component. */
export function clickAction(tree: ReactElement, label: string): void {
  findElement<{ onClick: () => void }>(
    tree,
    (element) => element.props.label === label && typeof element.props.onClick === "function",
  ).props.onClick();
}

/** Renders one function component from an element returned by its parent. */
export function renderElement<Props>(element: ReactElement<Props>): ReactNode {
  if (typeof element.type !== "function") {
    throw new Error("The element needs a function component.");
  }
  const component = element.type as (props: Props) => ReactNode;
  return component(element.props);
}

/** Renders a hook or component with state and effects that the test advances explicitly. */
export function renderHook<Data>(callback: () => Data): HookRender<Data> {
  const scope: RenderScope = {
    values: [],
    effects: new Map(),
    pending: [],
    index: 0,
    hasChanged: false,
  };
  return {
    render() {
      let result: Data;
      do {
        scope.index = 0;
        scope.hasChanged = false;
        active = scope;
        try {
          result = callback();
        } finally {
          active = undefined;
        }
        for (const effect of scope.pending.splice(0)) {
          effect();
        }
      } while (scope.hasChanged);
      return result;
    },
    unmount() {
      for (const effect of scope.effects.values()) {
        effect.cleanup?.();
      }
    },
  };
}

/** Returns React with hook storage for a render that has no browser document. */
export async function mockReact(): Promise<Record<string, unknown>> {
  const react = await vi.importActual<typeof import("react")>("react");
  return {
    ...react,
    useState,
    useRef,
    useEffect,
    useLayoutEffect: useEffect,
    useCallback,
    useEffectEvent,
  };
}

function currentScope(): RenderScope {
  if (active === undefined) {
    throw new Error("A hook needs an active render.");
  }
  return active;
}

function useState<State>(
  initial?: State | (() => State),
): [State, (next: State | ((current: State) => State)) => void] {
  const scope = currentScope();
  const index = scope.index++;
  if (!(index in scope.values)) {
    scope.values[index] = typeof initial === "function" ? (initial as () => State)() : initial;
  }
  return [
    scope.values[index] as State,
    (next) => {
      const previous = scope.values[index] as State;
      const value =
        typeof next === "function" ? (next as (current: State) => State)(previous) : next;
      scope.hasChanged ||= !Object.is(value, previous);
      scope.values[index] = value;
    },
  ];
}

function useRef<Value>(initial: Value): { current: Value } {
  return useState({ current: initial })[0];
}

function useEffectEvent<Callback>(callback: Callback): Callback {
  return callback;
}

function useCallback<Callback>(callback: Callback, dependencies: DependencyList): Callback {
  const scope = currentScope();
  const index = scope.index++;
  const previous = scope.values[index] as
    | { callback: Callback; dependencies: DependencyList }
    | undefined;
  if (
    previous === undefined ||
    dependencies.some((value, at) => !Object.is(value, previous.dependencies[at]))
  ) {
    scope.values[index] = { callback, dependencies };
    return callback;
  }
  return previous.callback;
}

function useEffect(callback: EffectCallback, dependencies?: DependencyList): void {
  const scope = currentScope();
  const index = scope.index++;
  const previous = scope.effects.get(index);
  if (
    dependencies !== undefined &&
    previous?.dependencies !== undefined &&
    dependencies.length === previous.dependencies.length &&
    dependencies.every((value, at) => Object.is(value, previous.dependencies?.[at]))
  ) {
    return;
  }
  scope.pending.push(() => {
    previous?.cleanup?.();
    scope.effects.set(index, { dependencies, cleanup: callback() });
  });
}
