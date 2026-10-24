import type { LoginEvent, LoginMethod, ProviderSummary } from "independum/api-types";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { CommandButton } from "./command-button.tsx";
import { HeadingRow } from "./heading-row.tsx";
import { type LoginHandle, removeLogin, startLogin } from "./login-api.ts";
import styles from "./login-panel.module.css";
import { TextField } from "./text-field.tsx";

type Question = Extract<LoginEvent, { type: "question" }>;

/** Properties of the login panel. */
interface LoginPanelProps {
  provider: ProviderSummary;
  onClose: () => void;
  onChanged: () => void;
  onDone: () => void;
}

/** Draws the sign-in options of one provider and follows a login through every step Pi asks for. */
export function LoginPanel({
  provider,
  onClose,
  onChanged,
  onDone,
}: LoginPanelProps): ReactElement {
  const [events, setEvents] = useState<LoginEvent[] | undefined>();
  const [answered, setAnswered] = useState<string[]>([]);
  const handle = useRef<LoginHandle | undefined>(undefined);
  const isRunning = useRef(false);

  // Closing the panel in the middle of a login cancels it on the server.
  useEffect(
    () => () => {
      if (isRunning.current) {
        handle.current?.cancel();
      }
    },
    [],
  );

  async function begin(method: LoginMethod): Promise<void> {
    setEvents([]);
    setAnswered([]);
    isRunning.current = true;
    try {
      handle.current = await startLogin(provider.id, method, (event) => {
        setEvents((current) => [...(current ?? []), event]);
        if (event.type === "done" || event.type === "failed") {
          isRunning.current = false;
        }
        if (event.type === "done") {
          onChanged();
        }
      });
    } catch (error) {
      isRunning.current = false;
      setEvents([{ type: "failed", message: messageOf(error) }]);
    }
  }

  function answer(question: Question, value: string): void {
    setAnswered((current) => [...current, question.questionId]);
    handle.current?.answer(question.questionId, value);
  }

  return (
    <section className={styles.panel} aria-label={`Sign in to ${provider.name}`}>
      <HeadingRow>
        <h2 className={styles.name}>
          <span className={styles.pointer}>&gt;</span> {provider.name}
        </h2>
        <CommandButton shortcut="x" label="Close" onClick={onClose} isQuiet />
      </HeadingRow>
      {events === undefined ? (
        <Options provider={provider} onBegin={begin} onChanged={onChanged} />
      ) : (
        <Steps
          events={events}
          answered={answered}
          onAnswer={answer}
          onRetry={() => setEvents(undefined)}
          onDone={onDone}
        />
      )}
    </section>
  );
}

/** Properties of the sign-in options. */
interface OptionsProps {
  provider: ProviderSummary;
  onBegin: (method: LoginMethod) => void;
  onChanged: () => void;
}

function Options({ provider, onBegin, onChanged }: OptionsProps): ReactElement {
  const canUseKey = provider.apiKey?.canLogIn === true;
  return (
    <div className={styles.steps}>
      {provider.login === null ? null : (
        <div className={styles.step}>
          <p className={styles.status}>Logged in.</p>
          <p className={styles.text}>Source: {provider.login.source ?? "unknown"}.</p>
          <CommandButton
            shortcut="r"
            label="Remove login"
            onClick={() => removeLogin(provider.id).then(onChanged)}
            isQuiet
          />
        </div>
      )}
      {provider.account === null ? null : (
        <div className={styles.step}>
          <p className={styles.text}>
            Sign in with your account. Your browser opens the sign-in page, and Independum finishes
            the login when you return.
          </p>
          <CommandButton
            shortcut="s"
            label={provider.account.buttonLabel ?? "Sign in with your account"}
            onClick={() => onBegin("account")}
          />
        </div>
      )}
      {canUseKey ? (
        <CommandButton
          shortcut="k"
          label="Use an API key"
          onClick={() => onBegin("apiKey")}
          isQuiet={provider.account !== null}
        />
      ) : null}
      {provider.account === null && !canUseKey ? (
        <p className={styles.text}>
          This provider is set up outside Independum, for example with environment variables.
        </p>
      ) : null}
    </div>
  );
}

/** Properties of the login steps. */
interface StepsProps {
  events: LoginEvent[];
  answered: string[];
  onAnswer: (question: Question, value: string) => void;
  onRetry: () => void;
  onDone: () => void;
}

function Steps({ events, answered, onAnswer, onRetry, onDone }: StepsProps): ReactElement {
  const final = events.find((event) => event.type === "done" || event.type === "failed");
  if (final?.type === "done") {
    return (
      <div className={styles.steps}>
        <p className={styles.status}>Connected.</p>
        <CommandButton shortcut="c" label="Continue" onClick={onDone} />
      </div>
    );
  }
  if (final?.type === "failed") {
    return (
      <div className={styles.steps}>
        <p className={styles.text}>{final.message}</p>
        <CommandButton shortcut="t" label="Try again" onClick={onRetry} />
      </div>
    );
  }

  const closed = new Set(
    events.flatMap((event) => (event.type === "questionClosed" ? [event.questionId] : [])),
  );
  const question = events.find(
    (event): event is Question =>
      event.type === "question" &&
      !closed.has(event.questionId) &&
      !answered.includes(event.questionId),
  );
  const link = events.findLast((event) => event.type === "link");
  const deviceCode = events.findLast((event) => event.type === "deviceCode");
  const note = events.findLast((event) => event.type === "note");

  return (
    <div className={styles.steps}>
      {deviceCode === undefined ? null : (
        <div className={styles.step}>
          <p className={styles.text}>Enter this code on the sign-in page.</p>
          <p className={styles.code}>{deviceCode.code}</p>
          <SignInLink key={deviceCode.url} url={deviceCode.url} />
        </div>
      )}
      {link === undefined || deviceCode !== undefined ? null : (
        <div className={styles.step}>
          {link.instructions === undefined ? null : (
            <p className={styles.text}>{link.instructions}</p>
          )}
          <SignInLink key={link.url} url={link.url} />
        </div>
      )}
      {note === undefined ? null : <p className={styles.text}>{note.message}</p>}
      {question === undefined ? (
        <p className={styles.status}>Waiting for the login to finish.</p>
      ) : (
        <QuestionForm key={question.questionId} question={question} onAnswer={onAnswer} />
      )}
    </div>
  );
}

/** Properties of the sign-in link commands. */
interface SignInLinkProps {
  url: string;
}

function SignInLink({ url }: SignInLinkProps): ReactElement {
  const [copy, setCopy] = useState<"copied" | "failed" | undefined>();

  // Browsers leave `navigator.clipboard` undefined outside secure contexts, so the call runs
  // inside a promise and any failure shows the link for copying by hand.
  function copyLink(): void {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(url))
      .then(
        () => setCopy("copied"),
        () => setCopy("failed"),
      );
  }

  return (
    <>
      <CommandButton
        shortcut="o"
        label="Open the sign-in page"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      />
      <CommandButton shortcut="c" label="Copy the link" onClick={copyLink} isQuiet />
      {copy === "copied" ? (
        <p className={styles.status}>Copied. Paste it into any browser.</p>
      ) : null}
      {copy === "failed" ? (
        <>
          <p className={styles.text}>This browser blocked copying. Select the link instead.</p>
          <p className={styles.link}>{url}</p>
        </>
      ) : null}
    </>
  );
}

/** Properties of a question form. */
interface QuestionFormProps {
  question: Question;
  onAnswer: (question: Question, value: string) => void;
}

function QuestionForm({ question, onAnswer }: QuestionFormProps): ReactElement {
  const [value, setValue] = useState("");

  if (question.kind === "choice") {
    return (
      <div className={styles.step}>
        <p className={styles.text}>{question.message}</p>
        {(question.options ?? []).map((option, index) => (
          <CommandButton
            key={option.id}
            shortcut={String(index + 1)}
            label={option.label}
            onClick={() => onAnswer(question, option.id)}
          />
        ))}
      </div>
    );
  }

  function submit(): void {
    if (value.trim() !== "") {
      onAnswer(question, value.trim());
    }
  }

  return (
    <form
      className={styles.step}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TextField
        id={`question-${question.questionId}`}
        label={question.message}
        value={value}
        onChange={setValue}
        isSecret={question.kind === "secret"}
        {...(question.placeholder === undefined ? {} : { placeholder: question.placeholder })}
      />
      {question.kind === "secret" ? (
        <p className={styles.text}>
          Independum keeps it on this machine, in ~/.independum, and does not test it.
        </p>
      ) : null}
      <CommandButton shortcut="enter" label="Continue" onClick={submit} />
    </form>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The login could not start.";
}
