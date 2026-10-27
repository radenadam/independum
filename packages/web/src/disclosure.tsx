import { type ReactElement, type ReactNode, useState } from "react";
import styles from "./disclosure.module.css";
import { Icon } from "./icon.tsx";

/** Properties of a disclosure. */
interface DisclosureProps {
  label: ReactNode;
  children: ReactNode;
}

/** Draws a row that opens to show what it holds, with a chevron that turns down while it is open. */
export function Disclosure({ label, children }: DisclosureProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={styles.disclosure}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.label}>{label}</span>
        <span className={styles.chevron}>
          <Icon name="expand" size={15} />
        </span>
      </button>
      {isOpen ? children : null}
    </div>
  );
}
