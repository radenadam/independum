import type { ReactElement } from "react";
import type { DescribedCall } from "./describe-tool-call.ts";
import { IconButton } from "./icon-button.tsx";

/** Properties of the actions of a running command. */
interface CommandActionsProps {
  id: string;
  canMove: boolean;
  tools: { onMove: (id: string) => void; onStop: (id: string) => void };
}

/** Returns the buttons of a call that the user can stop, or nothing for a call that cannot stop. */
export function commandActionsOf(
  id: string,
  call: DescribedCall,
  tools: CommandActionsProps["tools"],
): ReactElement | undefined {
  return call.canStop ? <CommandActions id={id} canMove={call.canMove} tools={tools} /> : undefined;
}

/**
 * Draws the buttons of one running command: one that moves a command of the reply to the
 * background, so the reply goes on while it runs, and one that stops it alone.
 */
export function CommandActions({ id, canMove, tools }: CommandActionsProps): ReactElement {
  return (
    <>
      {canMove ? (
        <IconButton
          icon="background"
          label="Move to the background"
          size="small"
          tipAlign="end"
          onClick={() => tools.onMove(id)}
        />
      ) : null}
      <IconButton
        icon="stopCommand"
        label="Stop this command"
        size="small"
        tipAlign="end"
        onClick={() => tools.onStop(id)}
      />
    </>
  );
}
