import { spawn } from "node:child_process";

export interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout and stderr interleaved as they arrived, for the run's log. */
  output: string;
  durationMs: number;
}

export interface ShellOptions {
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  /** Called with each chunk as it arrives. */
  onOutput?: (chunk: string) => void;
}

/**
 * Runs one command through the shell in a folder and returns everything it said; it never throws on a non-zero exit.
 * A plain shell, not a login shell: a login shell re-reads the profile, which on some systems resets PATH and loses
 * the node and pnpm the parent process was started with.
 */
export function sh(command: string, cwd: string, options: ShellOptions = {}): Promise<ShellResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", command], {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let output = "";
    const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs) : null;
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      output += text;
      options.onOutput?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      output += text;
      options.onOutput?.(text);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? (signal ? 137 : 1), stdout, stderr, output, durationMs: Date.now() - started });
    });
  });
}

/** Like sh, but a non-zero exit is an error carrying the output. */
export async function must(command: string, cwd: string, options: ShellOptions = {}): Promise<ShellResult> {
  const result = await sh(command, cwd, options);
  if (result.code !== 0) throw new Error(`\`${command}\` exited ${result.code} in ${cwd}:\n${result.output.trim()}`);
  return result;
}
