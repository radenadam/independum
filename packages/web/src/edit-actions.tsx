import type { ReactElement } from "react";
import { IconButton } from "./icon-button.tsx";

/** Properties of the edit actions. */
interface EditActionsProps {
  editLabel: string;
  resetLabel: string;
  isEdited: boolean;
  onEdit: () => void;
  onReset: () => void;
}

/**
 * Draws the button that opens a part of the agent to edit, and the button that brings back its
 * built-in texts and settings while the user has changed it.
 */
export function EditActions({
  editLabel,
  resetLabel,
  isEdited,
  onEdit,
  onReset,
}: EditActionsProps): ReactElement {
  return (
    <>
      <IconButton icon="edit" label={editLabel} size="small" tipAlign="end" onClick={onEdit} />
      {isEdited ? (
        <IconButton icon="reset" label={resetLabel} size="small" tipAlign="end" onClick={onReset} />
      ) : null}
    </>
  );
}
