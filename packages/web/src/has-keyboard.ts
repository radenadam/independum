/** Returns whether the user most likely types on a real keyboard. */
export function hasKeyboard(): boolean {
  // A screen with a hovering pointer most likely has a keyboard. On a touch screen, focusing a
  // field opens the keyboard over half the screen, and Enter adds a new line instead of sending,
  // because a phone keyboard has no Shift and Enter for that.
  return window.matchMedia("(hover: hover)").matches;
}
