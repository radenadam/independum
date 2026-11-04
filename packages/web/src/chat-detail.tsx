import type { ContextSummary } from "independum/api-types";
import type { ReactElement } from "react";
import { CodeWell } from "./code-well.tsx";
import { FactTable } from "./fact-table.tsx";
import { PlaceNote } from "./place-frame.tsx";
import { PlaceSection } from "./place-section.tsx";

/** Properties of the detail of a chat. */
interface ChatDetailProps {
  context: ContextSummary | undefined;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Draws when a chat started and was last active, and the files that hold it: the chat that Pi
 * saves, the whole output of its tools, and the last request that it sent.
 */
export function ChatDetail({ context }: ChatDetailProps): ReactElement {
  if (context === undefined || context.chatId === null) {
    return <PlaceNote>This chat is not saved yet. Pi saves it with its first message.</PlaceNote>;
  }
  const { files } = context;
  return (
    <>
      <PlaceSection heading="Times" badge="read-only">
        <FactTable
          columns={[""]}
          rows={[
            { name: "Started", values: [timeOf(context.created)] },
            { name: "Last active", values: [timeOf(context.lastActivity)] },
          ]}
        />
      </PlaceSection>
      <PlaceSection heading="Chat file">
        <PlaceNote>
          Pi writes each message, change of settings, and compaction of this chat to this file, a
          line each.
        </PlaceNote>
        {files.chat === null ? null : <CodeWell code={files.chat} copyLabel="Copy the path" />}
      </PlaceSection>
      <PlaceSection heading="Tool output">
        <PlaceNote>
          When the output of a tool is cut before it reaches the model, Independum saves all of it
          in this folder, a file for each call.
        </PlaceNote>
        {files.toolOutput === null ? null : (
          <CodeWell code={files.toolOutput} copyLabel="Copy the path" />
        )}
      </PlaceSection>
      <PlaceSection heading="Last request">
        <PlaceNote>
          Independum saves the last request of this chat here, exactly as it went, so the Session
          place shows it after a restart.
        </PlaceNote>
        {files.savedRequest === null ? null : (
          <CodeWell code={files.savedRequest} copyLabel="Copy the path" />
        )}
      </PlaceSection>
    </>
  );
}

function timeOf(value: string | null): string {
  return value === null ? "Not known" : timeFormat.format(new Date(value));
}
