interface CaptureCommand {
  type: "frame" | "diagnostic" | "end" | "exit" | "reproduce";
  bytes?: string;
  stream?: "stdout" | "stderr";
}

process.on("message", (command: CaptureCommand) => {
  if (command.type === "reproduce") {
    process.stdout.write("{}\n");
    process.stderr.write("Diagnostic before exit.\n", () => {
      process.stdout.write('{"afterStop":true}\n', () => process.send?.("written"));
    });
    return;
  }
  if (command.type === "exit") {
    process.disconnect?.();
    return;
  }
  const stream =
    command.type === "diagnostic" || command.stream === "stderr" ? process.stderr : process.stdout;
  function acknowledge(): void {
    process.send?.("written");
  }
  if (command.type === "end") {
    stream.end(acknowledge);
  } else {
    stream.write(Buffer.from(command.bytes ?? "", "base64"), acknowledge);
  }
});
