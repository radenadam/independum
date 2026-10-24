const shortcuts = [
  {
    pattern: /[\u2013\u2014]|\s--?\s|\w--\w/,
    problem: "Dashes do not join ideas. Use explicit words or separate sentences.",
  },
  {
    pattern: /;/,
    problem: "Semicolons do not join ideas. Use explicit words or separate sentences.",
  },
  {
    pattern: /[\w)]\/[\w(]/,
    problem:
      'Slashes do not stand for "and" or "or". Write the word, or put a path in a code span.',
  },
  {
    pattern: /\u2026|\.\.\./,
    problem: "Ellipses are not allowed. Finish the sentence.",
  },
  {
    pattern: /[\u2190-\u21ff]|->|=>/,
    problem: "Arrows are not allowed in prose. Describe the relationship in words.",
  },
];

/** Returns a problem for each kind of punctuation shortcut in the prose outside code spans. */
export function findPunctuationProblems(text: string): string[] {
  const prose = text.replace(/`[^`]*`/g, "code");
  return shortcuts.filter(({ pattern }) => pattern.test(prose)).map(({ problem }) => problem);
}
