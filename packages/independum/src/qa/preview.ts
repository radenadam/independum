import { previewOptions } from "./preview-options.ts";
import { startPreview } from "./start-preview.ts";

const preview = await startPreview(previewOptions(process.argv.slice(2), false));
process.stdout.write(`Preview home: ${preview.home}\nOpen this link:\n${preview.url}\n`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    preview.close().then(
      () => process.exit(0),
      (error: unknown) => {
        process.stderr.write(`${String(error)}\n`);
        process.exit(1);
      },
    );
  });
}
