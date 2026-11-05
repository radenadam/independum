/** The bounds for output lines in settings and their fields. */
export const outputLineRange = { min: 10, max: 1_000_000 };

/** The bounds for output kilobytes in the fields. */
export const outputKilobyteRange = { min: 1, max: 102_400 };

/** The bounds for output bytes in settings. */
export const outputByteRange: { min: number; max: number } = {
  min: outputKilobyteRange.min * 1024,
  max: outputKilobyteRange.max * 1024,
};
