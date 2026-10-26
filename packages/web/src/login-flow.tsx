import type { LoginEvent, LoginMethod, ProviderSummary } from "independum/api-types";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { type LoginHandle, startLogin } from "./login-api.ts";
import styles from "./login-flow.module.css";
import { ProviderLogo } from "./provider-logo.tsx";
import { TextButton } from "./text-button.tsx";
import { TextField } from "./text-field.tsx";

type Question = Extract<LoginEvent, { type: "question" }>;

/** Properties of the login flow. */
interface LoginFlowProps {
  provider: ProviderSummary;
  onChanged: () => void;
  onDone: () => void;
}

/** Draws the sign-in options of one provider and follows a login through every step Pi asks for. */
export function LoginFlow({ provider, onChanged, onDone }: LoginFlowProps): ReactElement {
  const [events, setEvents] = useState<LoginEvent[] | undefined>();
  const [answered, setAnswered] = useState<string[]>([]);
  const handle = useRef<LoginHandle | undefined>(undefined);
  const isRunning = useRef(false);

  // Leaving the flow in the middle of a login cancels it on the server.
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
    <section className={styles.flow} aria-label={`Sign in to ${provider.name}`}>
      <h3 className={styles.name}>
        <ProviderLogo providerId={provider.id} size={20} />
        {provider.name}
      </h3>
      {events === undefined ? (
        <Options provider={provider} onBegin={begin} />
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
}

function Options({ provider, onBegin }: OptionsProps): ReactElement {
  const canUseKey = provider.apiKey?.canLogIn === true;
  return (
    <div className={styles.steps}>
      {provider.login === null ? null : (
        <p className={styles.status}>Connected. Signing in again replaces this login.</p>
      )}
      {provider.account === null ? null : (
        <div className={styles.step}>
          <p className={styles.text}>
            Sign in with your account. Your browser opens the sign-in page, and Independum finishes
            the login when you return.
          </p>
          <TextButton
            label={provider.account.buttonLabel ?? "Sign in with your account"}
            onClick={() => onBegin("account")}
            isPrimary
          />
        </div>
      )}
      {canUseKey ? (
        <TextButton
          label="Use an API key"
          onClick={() => onBegin("apiKey")}
          isPrimary={provider.account === null}
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
        <TextButton label="Done" onClick={onDone} isPrimary />
      </div>
    );
  }
  if (final?.type === "failed") {
    return (
      <div className={styles.steps}>
        <p className={styles.error}>{final.message}</p>
        <TextButton label="Try again" onClick={onRetry} />
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

/** Properties of the sign-in link buttons. */
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
      <div className={styles.buttons}>
        <TextButton
          label="Open the sign-in page"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          isPrimary
        />
        <TextButton label={copy === "copied" ? "Copied" : "Copy the link"} onClick={copyLink} />
      </div>
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
        <div className={styles.buttons}>
          {(question.options ?? []).map((option) => (
            <TextButton
              key={option.id}
              label={option.label}
              onClick={() => onAnswer(question, option.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      className={styles.step}
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() !== "") {
          onAnswer(question, value.trim());
        }
      }}
    >
      <TextField
        id={`question-${question.questionId}`}
        label={question.message}
        value={value}
        onChange={setValue}
        kind={question.kind === "secret" ? "secret" : "text"}
        {...(question.placeholder === undefined ? {} : { placeholder: question.placeholder })}
      />
      {question.kind === "secret" ? (
        <p className={styles.text}>
          Independum keeps it on this machine, in ~/.independum, and does not test it.
        </p>
      ) : null}
      <TextButton label="Continue" isPrimary isSubmit />
    </form>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The login could not start.";
}
