import type { LoginEvent, LoginMethod } from "independum/api-types";
import { expect, test, vi } from "vitest";
import { waitFor } from "../../../scripts/wait-for.ts";
import { startLogin } from "./login-api.ts";
import { LoginFlow } from "./login-flow.tsx";
import { findElement, renderElement, renderHook } from "./render-hook.ts";

vi.mock("react", async () => (await import("./render-hook.ts")).mockReact());
vi.mock("./login-api.ts", () => ({ startLogin: vi.fn() }));

interface Steps {
  answered: string[];
  onAnswer: (question: LoginEvent, value: string) => Promise<void>;
}

interface Field {
  value: string;
  onChange: (value: string) => void;
}

test.each(["text", "choice"] as const)(
  "a failed %s login answer keeps the question and offers another attempt",
  async (kind) => {
    const question: LoginEvent = {
      type: "question",
      questionId: "question",
      kind,
      message: "Answer this question.",
      options: [{ id: "answer", label: "Choose this answer" }],
    };
    const { promise: pending, reject } = Promise.withResolvers<void>();
    const answer = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(undefined);
    vi.mocked(startLogin).mockImplementation(async (_providerId, _method, onEvent) => {
      onEvent(question);
      return { answer, cancel: vi.fn() };
    });
    const flow = renderHook(() =>
      LoginFlow({
        provider: {
          id: "provider",
          name: "Provider",
          apiKey: { label: "API key", canLogIn: true },
          account: null,
          login: null,
        },
        onChanged: vi.fn(),
        onDone: vi.fn(),
      }),
    );
    const options = findElement<{ onBegin: (method: LoginMethod) => Promise<void> }>(
      flow.render(),
      (element) => element.props.onBegin !== undefined,
    );
    await options.props.onBegin("apiKey");
    const steps = findElement<Steps>(
      flow.render(),
      (element) => element.props.answered !== undefined,
    );
    const questionElement = findElement(
      renderElement(steps),
      (element) => element.props.question !== undefined,
    );
    const form = renderHook(() => renderElement(questionElement));

    function submit(): void {
      const tree = form.render();
      if (kind === "choice") {
        findElement<{ onClick: () => void }>(
          tree,
          (element) => element.props.label === "Choose this answer",
        ).props.onClick();
      } else {
        findElement<{ onSubmit: (event: { preventDefault: () => void }) => void }>(
          tree,
          (element) => element.type === "form",
        ).props.onSubmit({ preventDefault: vi.fn() });
      }
    }

    if (kind === "text") {
      findElement<Field>(
        form.render(),
        (element) => element.props.label === question.message,
      ).props.onChange("answer");
    }
    submit();
    expect(
      findElement<Steps>(flow.render(), (element) => element.props.answered !== undefined).props
        .answered,
    ).toEqual([]);
    reject(new Error("The request failed."));
    await pending.catch(() => undefined);
    const tree = form.render();
    expect(
      findElement<{ children: string }>(tree, (element) => element.props.role === "alert").props
        .children,
    ).toBe("The answer could not be sent. Try again.");
    if (kind === "text") {
      expect(
        findElement<Field>(tree, (element) => element.props.label === question.message).props.value,
      ).toBe("answer");
    }
    submit();
    await waitFor(() =>
      expect(
        findElement<Steps>(flow.render(), (element) => element.props.answered !== undefined).props
          .answered,
      ).toEqual(["question"]),
    );
    expect(answer).toHaveBeenNthCalledWith(2, "question", "answer");
  },
);
