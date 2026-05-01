import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { checkDependency } from "@orchestrator/bootstrapper.ts";

Deno.test("checkDependency - which succeeds", async () => {
  const commandStub = stub(Deno, "Command", (cmd: any, options?: any) => {
    assertEquals(cmd, "which");
    assertEquals(options?.args, ["cargo"]);
    return {
      output: () => Promise.resolve({ success: true, stdout: new Uint8Array(), stderr: new Uint8Array() }),
    } as any;
  });

  try {
    const result = await checkDependency("cargo");
    assertEquals(result, true);
    assertEquals(commandStub.calls.length, 1);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - empty string", async () => {
  const commandStub = stub(Deno, "Command", (cmd: any, options?: any) => {
    assertEquals(options?.args, [""]);
    return {
      output: () => Promise.resolve({ success: false, stdout: new Uint8Array(), stderr: new Uint8Array() }),
    } as any;
  });

  try {
    const result = await checkDependency("");
    assertEquals(result, false);
    assertEquals(commandStub.calls.length, 1);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - special characters", async () => {
  const commandStub = stub(Deno, "Command", (cmd: any, options?: any) => {
    assertEquals(options?.args, ["cmd; rm -rf /"]);
    return {
      output: () => Promise.resolve({ success: false, stdout: new Uint8Array(), stderr: new Uint8Array() }),
    } as any;
  });

  try {
    const result = await checkDependency("cmd; rm -rf /");
    assertEquals(result, false);
    assertEquals(commandStub.calls.length, 1);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - which fails", async () => {
  const commandStub = stub(Deno, "Command", (cmd: any, options?: any) => {
    assertEquals(cmd, "which");
    assertEquals(options?.args, ["nonexistent"]);
    return {
      output: () => Promise.resolve({ success: false, stdout: new Uint8Array(), stderr: new Uint8Array() }),
    } as any;
  });

  try {
    const result = await checkDependency("nonexistent");
    assertEquals(result, false);
    assertEquals(commandStub.calls.length, 1);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - which throws, where succeeds", async () => {
  const commandStub = stub(Deno, "Command", (cmd: any, options?: any) => {
    if (cmd === "which") {
      assertEquals(options?.args, ["cargo"]);
      throw new Error("which not found");
    }
    assertEquals(cmd, "where");
    assertEquals(options?.args, ["cargo"]);
    return {
      output: () => Promise.resolve({ success: true, stdout: new Uint8Array(), stderr: new Uint8Array() }),
    } as any;
  });

  try {
    const result = await checkDependency("cargo");
    assertEquals(result, true);
    assertEquals(commandStub.calls.length, 2);
    assertEquals(commandStub.calls[0].args[0], "which");
    assertEquals(commandStub.calls[1].args[0], "where");
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - which throws, where fails", async () => {
  const commandStub = stub(Deno, "Command", (cmd: any, options?: any) => {
    if (cmd === "which") {
      assertEquals(options?.args, ["nonexistent"]);
      throw new Error("which not found");
    }
    assertEquals(cmd, "where");
    assertEquals(options?.args, ["nonexistent"]);
    return {
      output: () => Promise.resolve({ success: false, stdout: new Uint8Array(), stderr: new Uint8Array() }),
    } as any;
  });

  try {
    const result = await checkDependency("nonexistent");
    assertEquals(result, false);
    assertEquals(commandStub.calls.length, 2);
    assertEquals(commandStub.calls[0].args[0], "which");
    assertEquals(commandStub.calls[1].args[0], "where");
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - both throw", async () => {
  const commandStub = stub(Deno, "Command", (cmd: any, options?: any) => {
    assertEquals(options?.args, ["any"]);
    throw new Error("command not found");
  });

  try {
    const result = await checkDependency("any");
    assertEquals(result, false);
    assertEquals(commandStub.calls.length, 2);
    assertEquals(commandStub.calls[0].args[0], "which");
    assertEquals(commandStub.calls[1].args[0], "where");
  } finally {
    commandStub.restore();
  }
});
