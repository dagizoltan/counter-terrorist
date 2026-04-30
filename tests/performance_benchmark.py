import subprocess
import json
import time
import uuid

def send_command(proc, cmd):
    cmd_id = str(uuid.uuid4())
    cmd['id'] = cmd_id
    line = json.dumps(cmd) + "\n"
    proc.stdin.write(line.encode())
    proc.stdin.flush()

    # Read response
    while True:
        resp_line = proc.stdout.readline().decode()
        if not resp_line:
            return None
        try:
            resp = json.loads(resp_line)
            if resp.get('id') == cmd_id:
                return resp
        except:
            continue

def main():
    binary_path = "agents/target/release/scanner"
    paths = ["/etc", "/usr/bin", "/var/log"]
    iterations = 5

    proc = subprocess.Popen(
        [binary_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0
    )

    # Wait for initialization
    time.sleep(1)

    print(f"Benchmarking with paths: {paths}")

    # N+1 Communication (Multi-command)
    multi_cmd_times = []
    for _ in range(iterations):
        start = time.perf_counter()
        results = []
        for p in paths:
            res = send_command(proc, {"type": "DIR_SCAN", "path": p})
            if res and res.get('files'):
                results.extend(res['files'])
        multi_cmd_times.append(time.perf_counter() - start)

    avg_multi = sum(multi_cmd_times) / iterations
    print(f"Average Multi-command (N+1): {avg_multi*1000:.2f}ms")

    # Optimized (Single-command)
    single_cmd_times = []
    for _ in range(iterations):
        start = time.perf_counter()
        res = send_command(proc, {"type": "DIR_SCAN", "paths": paths})
        single_cmd_times.append(time.perf_counter() - start)

    avg_single = sum(single_cmd_times) / iterations
    print(f"Average Single-command (Optimized): {avg_single*1000:.2f}ms")

    improvement = (avg_multi - avg_single) / avg_multi * 100
    print(f"Improvement: {improvement:.2f}%")

    proc.terminate()

if __name__ == "__main__":
    main()
