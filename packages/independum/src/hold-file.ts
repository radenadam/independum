import { closeSync, openSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Opens a file as a virus scan does, which on Windows blocks moving and deleting it, and returns a
 * release that closes it once.
 */
export function holdFile(path: string): () => void {
  const close = process.platform === "win32" ? holdNatively(path) : holdWithNode(path);
  let isHeld = true;
  return () => {
    if (isHeld) {
      isHeld = false;
      close();
    }
  };
}

// Node opens files with delete sharing, so only a native handle that shares reading alone blocks
// a move or a delete the way a scanner or the search indexer does.
function holdNatively(path: string): () => void {
  const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
  const kernel = koffi.load("kernel32.dll");
  const createFile = kernel.func(
    "void* __stdcall CreateFileW(const char16_t* path, uint32_t access, uint32_t share, void* security, uint32_t creation, uint32_t flags, void* template)",
  );
  const closeHandle = kernel.func("bool __stdcall CloseHandle(void* handle)");
  const handle: unknown = createFile(path, 0x80000000, 1, null, 3, 0x80, null);
  if (koffi.address(handle) === 0xffffffffffffffffn) {
    throw new Error(`The test could not hold "${path}" open.`);
  }
  return () => closeHandle(handle);
}

function holdWithNode(path: string): () => void {
  const descriptor = openSync(path, "r");
  return () => closeSync(descriptor);
}
