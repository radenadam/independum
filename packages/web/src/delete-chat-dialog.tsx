import type { ChatSummary } from "independum/api-types";
import type { ReactElement } from "react";
import { deleteChat } from "./chat-api.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";

/** Properties of the delete chat dialog. */
interface DeleteChatDialogProps {
  chat: ChatSummary;
  isArchived: boolean;
  onClose: () => void;
  onDone: (notice: string | undefined) => void;
}

/** Asks before deleting a chat for good, then deletes it and reports a failure as a notice. */
export function DeleteChatDialog({
  chat,
  isArchived,
  onClose,
  onDone,
}: DeleteChatDialogProps): ReactElement {
  const place = isArchived ? "~/.independum/sessions/archived" : "~/.independum/sessions";
  const advice = isArchived ? "" : " Archive the chat instead to keep it out of sight.";
  return (
    <ConfirmDialog
      title="Delete this chat?"
      text={`"${chat.title}" and its file in ${place} go away for good.${advice}`}
      confirmLabel="Delete"
      onConfirm={() => {
        onClose();
        deleteChat(chat.id).then(
          () => onDone(undefined),
          () => onDone("The chat could not be deleted. Try again."),
        );
      }}
      onCancel={onClose}
    />
  );
}
