import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PersistentQueue } from "../src/orchestrator/core/utils/persistent_queue.ts";

Deno.test("PersistentQueue Resilience - Pagination prevents OOM on large queues", async () => {
  const kv = await Deno.openKv(":memory:");
  const queue = new PersistentQueue<string>(kv, "test_large_queue");

  // Enqueue 250 items
  for (let i = 0; i < 250; i++) {
    await queue.enqueue(`item-${i}`);
  }

  let processedCount = 0;
  // Process with batchSize of 100
  await queue.process(async (item) => {
    processedCount++;
    return true;
  }, 5, 100);

  assertEquals(processedCount, 100, "First process call should only handle one batch of 100");

  await queue.process(async (item) => {
    processedCount++;
    return true;
  }, 5, 100);

  assertEquals(processedCount, 200, "Second process call should handle next batch of 100");

  await queue.process(async (item) => {
    processedCount++;
    return true;
  }, 5, 100);

  assertEquals(processedCount, 250, "Third process call should handle remaining 50 items");

  kv.close();
});

Deno.test("PersistentQueue Resilience - Atomic DLQ transition on failure", async () => {
  const kv = await Deno.openKv(":memory:");
  const queueName = "test_failure_queue";
  const queue = new PersistentQueue<string>(kv, queueName);

  await queue.enqueue("poison-pill");

  // Process and fail 5 times (default maxAttempts)
  for (let i = 0; i < 5; i++) {
    await queue.process(async (item) => {
        return false; // Simulated failure
    });
  }

  // Verify it's gone from main queue
  const iter = kv.list({ prefix: ["queue", queueName] });
  let foundInMain = false;
  for await (const entry of iter) {
      if (entry.key.length === 3) foundInMain = true; // Still in main queue
  }
  assertEquals(foundInMain, false, "Item should be removed from main queue after max failures");

  // Verify it's in DLQ
  const dlqIter = kv.list({ prefix: ["queue", queueName, "dlq"] });
  let foundInDlq = false;
  for await (const entry of dlqIter) {
      foundInDlq = true;
      assertEquals((entry.value as any).item, "poison-pill");
      assertEquals((entry.value as any).attempts, 5);
  }
  assertEquals(foundInDlq, true, "Item should be moved to DLQ atomically");

  kv.close();
});
