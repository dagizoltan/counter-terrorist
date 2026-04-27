/**
 * Bootstrapper for the Security Orchestrator.
 * Handles OS detection, dependency verification, and permission checks.
 */

export interface SystemStatus {
  os: string;
  isRoot: boolean;
  dependencies: Record<string, boolean>;
}

export async function checkDependency(cmd: string): Promise<boolean> {
  try {
    const command = new Deno.Command("which", {
      args: [cmd],
    });
    const { success } = await command.output();
    return success;
  } catch {
    // For Windows 'which' doesn't exist, we might need 'where'
    try {
      const command = new Deno.Command("where", {
        args: [cmd],
      });
      const { success } = await command.output();
      return success;
    } catch {
      return false;
    }
  }
}

export async function bootstrap(): Promise<SystemStatus> {
  const os = Deno.build.os;
  const isRoot = os === "windows" ? true : (Deno.uid?.() === 0); // Simplified for Windows

  const deps: string[] = ["cargo"];
  if (os === "linux") deps.push("ufw", "ss");
  if (os === "macos") deps.push("launchctl", "system_profiler");
  if (os === "windows") deps.push("powershell");

  const dependencies: Record<string, boolean> = {};
  for (const dep of deps) {
    dependencies[dep] = await checkDependency(dep);
  }

  return {
    os,
    isRoot,
    dependencies,
  };
}

export async function generateDesktopShortcut() {
  const os = Deno.build.os;
  if (os !== "linux") {
    console.log("Desktop shortcut generation only implemented for Linux.");
    return;
  }

  const home = Deno.env.get("HOME");
  if (!home) return;

  const shortcutPath = `${home}/.local/share/applications/counter-terrorist.desktop`;
  const content = `[Desktop Entry]
Type=Application
Name=Counter-Terrorist Dashboard
Comment=Security Orchestrator Web Console
Exec=xdg-open http://localhost:8000
Icon=security-high
Categories=System;Security;
Terminal=false
`;

  try {
    await Deno.mkdir(`${home}/.local/share/applications`, { recursive: true });
    await Deno.writeTextFile(shortcutPath, content);
    console.log(`Desktop shortcut created at: ${shortcutPath}`);
  } catch (error) {
    console.error(`Failed to create desktop shortcut: ${error}`);
  }
}

if (import.meta.main) {
  console.log("--- Initializing Security Orchestrator Bootstrapper ---");
  const status = await bootstrap();
  console.log(`OS: ${status.os}`);
  console.log(`Elevated Privileges: ${status.isRoot ? "YES" : "NO"}`);
  console.log("Dependencies:");
  for (const [dep, found] of Object.entries(status.dependencies)) {
    console.log(`  - ${dep}: ${found ? "FOUND" : "NOT FOUND"}`);
  }

  if (!status.dependencies.cargo) {
    console.warn("\n[WARNING] 'cargo' not found. Rust sidecars cannot be compiled from source.");
  }

  if (!status.isRoot) {
    console.warn("\n[WARNING] Running without root/admin privileges. Active blocking and deep auditing will be limited.");
  }

  if (Deno.args.includes("--generate-shortcut")) {
    await generateDesktopShortcut();
  }
}
