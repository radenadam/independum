import { createRequire } from "node:module";

/** A Windows job that holds a command and every program that it starts, so they end together. */
export interface WindowsJob {
  end(): void;
  close(): void;
}

/** The functions of Windows that a job needs, with the arguments that Independum always passes. */
interface JobFunctions {
  createJob: () => unknown;
  openProcess: (pid: number) => unknown;
  assign: (job: unknown, process: unknown) => boolean;
  terminate: (job: unknown) => boolean;
  closeHandle: (handle: unknown) => boolean;
}

// The rights to the process that putting it in a job needs: to set its quota and to end it.
const processAccess = 0x0100 | 0x0001;
let functions: JobFunctions | undefined;

/**
 * Puts a running process in a new Windows job, which every program that it starts joins too, or
 * returns undefined when the job cannot be made.
 */
export function openWindowsJob(pid: number): WindowsJob | undefined {
  try {
    functions ??= loadJobFunctions();
  } catch {
    return undefined;
  }
  const { createJob, openProcess, assign, terminate, closeHandle } = functions;
  const job = createJob();
  const handle = openProcess(pid);
  const isAssigned = job !== null && handle !== null && assign(job, handle);
  if (handle !== null) {
    closeHandle(handle);
  }
  if (!isAssigned) {
    if (job !== null) {
      closeHandle(job);
    }
    return undefined;
  }
  let isClosed = false;
  return {
    end() {
      if (!isClosed) {
        terminate(job);
      }
    },
    // A closed job lets its programs run on, as a program that an ended command left behind does.
    close() {
      if (!isClosed) {
        isClosed = true;
        closeHandle(job);
      }
    },
  };
}

// Koffi calls the functions of Windows directly. It loads native code, so it loads only when a
// command first runs on Windows.
function loadJobFunctions(): JobFunctions {
  const koffi = createRequire(import.meta.url)("koffi") as typeof import("koffi");
  const kernel32 = koffi.load("kernel32.dll");
  const createJob = kernel32.func(
    "void* __stdcall CreateJobObjectW(void* attributes, const char16_t* name)",
  );
  const openProcess = kernel32.func(
    "void* __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)",
  );
  const assign = kernel32.func("bool __stdcall AssignProcessToJobObject(void* job, void* process)");
  const terminate = kernel32.func("bool __stdcall TerminateJobObject(void* job, uint32_t code)");
  const closeHandle = kernel32.func("bool __stdcall CloseHandle(void* handle)");
  return {
    createJob: () => createJob(null, null),
    openProcess: (pid) => openProcess(processAccess, false, pid),
    assign: (job, process) => assign(job, process),
    terminate: (job) => terminate(job, 1),
    closeHandle: (handle) => closeHandle(handle),
  };
}
