# Technical & Security Issue Report - Counter-Terrorist Orchestrator

This report details identified issues within the Counter-Terrorist security orchestrator, covering the TypeScript/Deno orchestrator and Rust sidecar agents.

## 1. High Severity Issues

### 1.1 AppArmor Profile Deployment TOCTOU (Time-of-Check Time-of-Use)
- **File:** `src/orchestrator/domain/protection/kernel_service.ts`
- **Component:** `KernelService.deployAppArmorProfile`
- **Type:** Security (Race Condition)
- **Description:**
  The service generates AppArmor profiles and writes them to `/tmp/${profileName}.profile` before copying them to `/etc/apparmor.d/`.
  ```typescript
  const tempFile = `/tmp/${profileName}.profile`;
  await Deno.writeTextFile(tempFile, profile);
  const cpRes = await this.executor.execute("cp", [tempFile, `/etc/apparmor.d/${profileName}`]);
  ```
  Since `/tmp` is a world-writable directory, a local malicious process can monitor for the creation of this file and replace it with a symlink or a modified profile between the `writeTextFile` and the `cp` execution. This allows an attacker to escalate privileges or disable protections for sidecars.
- **Remediation:** Use a secure, root-owned temporary directory (e.g., `/var/lib/cts/tmp`) or write directly to the destination with a temporary suffix and rename within the same filesystem.

---

## 2. Medium Severity Issues

### 2.1 Pseudo-Streaming OOM Vulnerability in Hashing
- **File:** `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Component:** `SidecarManager.digestStream`
- **Type:** Performance / Stability
- **Description:**
  The `digestStream` method is implemented to avoid OOM by "processing in chunks," but it collects all chunks into an array and combines them before hashing.
  ```typescript
  while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // ... memory protection check ...
      chunks.push(value);
      totalLength += value.length;
  }
  const combined = new Uint8Array(totalLength);
  // ... copies chunks ...
  return await crypto.subtle.digest(algorithm, combined);
  ```
  This effectively loads the entire file (up to 100MB as per the check) into a single contiguous buffer. On systems with constrained memory, this increases the risk of OOM and causes unnecessary memory pressure.
- **Remediation:** Use a truly incremental hashing implementation or leverage the native `sha256sum` more consistently (which is already used in `calculateHash` but `digestStream` remains as a flawed fallback).

### 2.2 Unbounded Memory Growth in Audit Merkle Tree
- **File:** `src/orchestrator/domain/analysis/audit.ts`
- **Component:** `AuditService`
- **Type:** Performance / Stability
- **Description:**
  The `currentSessionHashes` array stores the hash of every audit event. It is only cleared every 10 minutes (or on shutdown) during `commitMerkleRoot`.
  ```typescript
  this.intervals.push(setInterval(() => this.commitMerkleRoot(), jitter(600000)));
  ```
  In a high-activity environment (e.g., during a system-wide security incident or a DDoS), the number of events could reach tens of thousands per minute. There is no upper bound on this array, which could lead to memory exhaustion.
- **Remediation:** Implement a maximum threshold for `currentSessionHashes`. Once the threshold is reached, trigger an early `commitMerkleRoot`.

### 2.3 Permissive Remote Path Bypass in SSH/SCP
- **File:** `src/orchestrator/infrastructure/system/system_executor.ts`
- **Component:** `SystemExecutor.validateSensitiveArgument`
- **Type:** Security (Bypass)
- **Description:**
  Arguments for `ssh` and `scp` that look like remote paths bypass all validation.
  ```typescript
  if ((baseCmd === "scp" || baseCmd === "ssh") && /^[a-z0-9]+@([a-z0-9.-]+|\[[a-f0-9:]+\]):.*$/.test(arg)) {
      return { valid: true };
  }
  ```
  While intended to allow remote destinations, this regex-based bypass returns `valid: true` immediately, skipping the `isPotentiallyDangerous` check. An attacker might craft a string that satisfies the regex but contains metacharacters that cause issues if the argument is later processed by a shell or expanded.
- **Remediation:** Ensure that even remote path arguments are checked for shell metacharacters (`&`, `|`, `;`, etc.) before returning `valid: true`.

### 2.4 Inefficient Cache Eviction in Rust Sidecar
- **File:** `src/agents/analyzer/src/main.rs`
- **Component:** `analyzer` (Rust Agent)
- **Type:** Performance
- **Description:**
  The `hash_file` function performs an $O(n)$ `retain` operation followed by an $O(n \log n)$ sort whenever the cache is full.
  ```rust
  HASH_CACHE.retain(|_, v| now_s - v.timestamp < 3600);
  if HASH_CACHE.len() >= MAX_CACHE_SIZE {
      let mut entries: Vec<(String, u64)> = HASH_CACHE.iter()...collect();
      entries.sort_by_key(|e| e.1);
      // ... removal ...
  }
  ```
  Performing these operations on the hot path of a filesystem scan significantly slows down scanning when the cache limit (5000) is reached.
- **Remediation:** Use an LRU cache crate or a more efficient eviction strategy that doesn't require sorting the entire cache on every insertion once full.

---

## 3. Low Severity & Architectural Issues

### 3.1 Dead Code in Sidecar Discovery
- **File:** `src/orchestrator/infrastructure/runtime/sidecar_manager.ts`
- **Component:** `SidecarManager.findBinary`
- **Type:** Maintenance
- **Description:**
  The method calculates `agentsDir` and checks for its existence, but the variable is never used in the search logic.
- **Remediation:** Remove the unused logic to reduce complexity.

### 3.2 Overly Broad Metacharacter Blocking
- **File:** `src/orchestrator/infrastructure/system/system_executor.ts`
- **Component:** `SystemExecutor.isPotentiallyDangerous`
- **Type:** Usability
- **Description:**
  Characters like `[` and `]` are blocked globally. This interferes with legitimate use cases such as bracketed IPv6 addresses in command arguments, which then require specific regex whitelisting to bypass.
- **Remediation:** Refine the "dangerous" check to be context-aware or focus on characters that enable command chaining/redirection.
