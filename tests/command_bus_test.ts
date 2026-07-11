import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CommandBus } from "../src/orchestrator/core/command_bus.ts";

Deno.test("CommandBus - Register and Dispatch Command", async () => {
    const commandBus = new CommandBus();

    commandBus.register("TestCommand", async (command) => {
        return { success: true, received: command.payload };
    });

    const result = await commandBus.dispatch<{ success: boolean; received: string }>({
        type: "TestCommand",
        payload: "hello"
    });

    assertEquals(result.success, true);
    assertEquals(result.received, "hello");
});

Deno.test("CommandBus - Dispatch Unregistered Command Throws Error", async () => {
    const commandBus = new CommandBus();

    await assertRejects(
        () => commandBus.dispatch({ type: "UnknownCommand" }),
        Error,
        "CommandBus Error: No handler registered for command: UnknownCommand"
    );
});
