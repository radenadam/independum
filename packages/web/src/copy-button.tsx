import { type ReactElement, useEffect, useState } from "react";
import { IconButton } from "./icon-button.tsx";

/** Properties of a copy button. */
interface CopyButtonProps {
  text: string;
  label: string;
  tipAlign: "start" | "end";
}

// How long the check stays after a copy, before the button turns back.
const copiedTime = 1500;

/** Draws a button that copies a text and turns into an orange check for a moment. */
export function CopyButton({ text, label, tipAlign }: CopyButtonProps): ReactElement {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }
    const timer = setTimeout(() => setIsCopied(false), copiedTime);
    return () => clearTimeout(timer);
  }, [isCopied]);

  return (
    <IconButton
      icon={isCopied ? "check" : "copy"}
      label={isCopied ? "Copied" : label}
      size="small"
      tipAlign={tipAlign}
      isHighlighted={isCopied}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => setIsCopied(true),
          () => setIsCopied(false),
        );
      }}
    />
  );
}
