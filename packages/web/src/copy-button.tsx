import { type ReactElement, useEffect, useState } from "react";
import { ActionMenu } from "./action-menu.tsx";
import { type ClipboardContent, writeClipboard } from "./clipboard-content.ts";
import styles from "./copy-button.module.css";
import { IconButton } from "./icon-button.tsx";
import { Popover } from "./popover.tsx";

/** Another way to copy, which the menu beside a copy button offers. */
interface CopyOption {
  label: string;
  content: () => ClipboardContent;
}

/** Properties of a copy button. */
interface CopyButtonProps {
  text: string;
  label: string;
  tipAlign: "start" | "end";
  html?: () => string;
  options?: CopyOption[];
}

// How long the check stays after a copy, before the button turns back.
const copiedTime = 1500;

/**
 * Draws a button that copies a text, with its formatting when it has some, and turns into an orange
 * check for a moment. Other ways to copy open from a menu beside it.
 */
export function CopyButton({
  text,
  label,
  tipAlign,
  html,
  options,
}: CopyButtonProps): ReactElement {
  const [isCopied, setIsCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }
    const timer = setTimeout(() => setIsCopied(false), copiedTime);
    return () => clearTimeout(timer);
  }, [isCopied]);

  function copy(content: ClipboardContent): void {
    writeClipboard(content).then(
      () => setIsCopied(true),
      () => setIsCopied(false),
    );
  }

  const button = (
    <IconButton
      icon={isCopied ? "check" : "copy"}
      label={isCopied ? "Copied" : label}
      size="small"
      tipAlign={tipAlign}
      isHighlighted={isCopied}
      onClick={() => copy(html === undefined ? { text } : { text, html: html() })}
    />
  );
  if (options === undefined) {
    return button;
  }
  return (
    <span className={styles.anchor}>
      {button}
      <IconButton
        icon="menu"
        label="Copy options"
        size="tiny"
        tipAlign={tipAlign}
        isExpanded={isMenuOpen}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
      />
      {isMenuOpen ? (
        <Popover
          label="Copy options"
          place="above"
          size="narrow"
          onClose={() => setIsMenuOpen(false)}
        >
          <ActionMenu
            label="Copy options"
            groups={[
              options.map((option) => ({
                icon: "copy" as const,
                label: option.label,
                onSelect: () => {
                  setIsMenuOpen(false);
                  copy(option.content());
                },
              })),
            ]}
          />
        </Popover>
      ) : null}
    </span>
  );
}
