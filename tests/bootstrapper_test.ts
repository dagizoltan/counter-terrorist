import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { checkDependency } from "@app/bootstrapper.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

Deno.test("checkDependency - which succeeds", async () => {
  const executor = new SystemExecutor();
  const commandStub = stub(executor, "execute", (cmd: any, args?: any) => {
    assertEquals(cmd, "which");
    assertEquals(args, ["cargo"]);
    return Promise.resolve({ success: true, stdout: "", stderr: "" });
  });

  try {
    const result = await checkDependency(executor, "cargo");
    assertEquals(result, true);
    assertEquals(commandStub.calls.length, 1);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - empty string", async () => {
  const executor = new SystemExecutor();
  const commandStub = stub(executor, "execute", (cmd: any, args?: any) => {
    return Promise.resolve({ success: false, stdout: "", stderr: "" });
  });

  try {
    const result = await checkDependency(executor, "");
    assertEquals(result, false);
    // 2 calls: which (fails) then where (fails)
    assertEquals(commandStub.calls.length, 2);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - special characters", async () => {
  const executor = new SystemExecutor();
  const commandStub = stub(executor, "execute", (cmd: any, args?: any) => {
    return Promise.resolve({ success: false, stdout: "", stderr: "" });
  });

  try {
    const result = await checkDependency(executor, "cmd; rm -rf /");
    assertEquals(result, false);
    // 2 calls: which (fails) then where (fails)
    assertEquals(commandStub.calls.length, 2);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - which fails", async () => {
  const executor = new SystemExecutor();
  const commandStub = stub(executor, "execute", (cmd: any, args?: any) => {
    return Promise.resolve({ success: false, stdout: "", stderr: "" });
  });

  try {
    const result = await checkDependency(executor, "nonexistent");
    assertEquals(result, false);
    // 2 calls: which (fails) then where (fails)
    assertEquals(commandStub.calls.length, 2);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - which throws, where succeeds", async () => {
  const executor = new SystemExecutor();
  const commandStub = stub(executor, "execute", (cmd: any, args?: any) => {
    if (cmd === "which") {
      assertEquals(args, ["cargo"]);
      throw new Error("which not found");
    }
    assertEquals(cmd, "where");
    assertEquals(args, ["cargo"]);
    return Promise.resolve({ success: true, stdout: "", stderr: "" });
  });

  try {
    const result = await checkDependency(executor, "cargo");
    assertEquals(result, true);
    // 2 calls: which (fails/throws) then where (succeeds)
    assertEquals(commandStub.calls.length, 2);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - which throws, where fails", async () => {
  const executor = new SystemExecutor();
  const commandStub = stub(executor, "execute", (cmd: any, args?: any) => {
    if (cmd === "which") {
      assertEquals(args, ["nonexistent"]);
      throw new Error("which not found");
    }
    assertEquals(cmd, "where");
    assertEquals(args, ["nonexistent"]);
    return Promise.resolve({ success: false, stdout: "", stderr: "" });
  });

  try {
    const result = await checkDependency(executor, "nonexistent");
    assertEquals(result, false);
    assertEquals(commandStub.calls.length, 2);
  } finally {
    commandStub.restore();
  }
});

Deno.test("checkDependency - both throw", async () => {
  const executor = new SystemExecutor();
  const commandStub = stub(executor, "execute", (cmd: any, args?: any) => {
    throw new Error("command not found");
  });

  try {
    const result = await checkDependency(executor, "any");
    assertEquals(result, false);
    assertEquals(commandStub.calls.length, 2);
  } finally {
    commandStub.restore();
  }
});
