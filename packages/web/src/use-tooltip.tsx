import {
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./use-tooltip.module.css";

/** Handlers to spread on an element, and the tooltip to draw beside them. */
interface Tooltip {
  handlers: {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
    onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
    onPointerDown: () => void;
    onFocus: (event: FocusEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
  toggle: (element: HTMLElement) => void;
  tooltip: ReactNode;
}

const edge = 16;
const gap = 6;
// A tooltip below an element this close to the bottom of the window would leave it, so it shows above.
const roomBelow = 120;

/**
 * Shows a text in a tooltip while a mouse rests on an element or the keyboard focuses it, and shows
 * nothing while the text is undefined. The tooltip sits on the page, so no clipped parent cuts it.
 */
export function useTooltip(text: string | undefined): Tooltip {
  const [place, setPlace] = useState<CSSProperties | undefined>();

  // The tooltip grows away from the nearer side of the window, so it stays inside without measuring.
  function show(element: HTMLElement): void {
    if (text === undefined) {
      return;
    }
    const box = element.getBoundingClientRect();
    const across =
      box.left < window.innerWidth / 2
        ? { "--left": `${Math.max(edge, box.left)}px` }
        : { "--right": `${Math.max(edge, window.innerWidth - box.right)}px` };
    const down =
      box.bottom + roomBelow > window.innerHeight
        ? { "--bottom": `${window.innerHeight - box.top + gap}px` }
        : { "--top": `${box.bottom + gap}px` };
    setPlace({ ...across, ...down } as CSSProperties);
  }

  function hide(): void {
    setPlace(undefined);
  }

  return {
    handlers: {
      onPointerEnter: (event) => {
        if (event.pointerType === "mouse") {
          show(event.currentTarget);
        }
      },
      // A finger leaves the element when it lifts, so only a mouse that moves away hides the tooltip.
      onPointerLeave: (event) => {
        if (event.pointerType === "mouse") {
          hide();
        }
      },
      onPointerDown: hide,
      onFocus: (event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          show(event.currentTarget);
        }
      },
      onBlur: hide,
    },
    toggle: (element) => {
      if (place === undefined) {
        show(element);
      } else {
        hide();
      }
    },
    tooltip:
      place === undefined || text === undefined
        ? null
        : createPortal(
            <span className={styles.floating} role="tooltip" style={place}>
              {text}
            </span>,
            document.body,
          ),
  };
}
