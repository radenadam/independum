import type { ContextSummary } from "independum/api-types";
import type { CSSProperties, ReactElement } from "react";
import { describeUsage, usageRatio } from "./describe-usage.ts";
import { IconButton } from "./icon-button.tsx";

/** Properties of the context meter. */
interface ContextMeterProps {
  context: ContextSummary | undefined;
  onOpen: () => void;
}

/**
 * Draws the Context ring, which fills as the context window of the open chat fills, names how full
 * it is on hover, and opens the Context place.
 */
export function ContextMeter({ context, onOpen }: ContextMeterProps): ReactElement {
  return (
    <span style={{ "--ratio": usageRatio(context) } as CSSProperties}>
      <IconButton
        icon="context"
        label={`Context used: ${describeUsage(context)}`}
        tipSide="above"
        tipAlign="end"
        onClick={onOpen}
      />
    </span>
  );
}
