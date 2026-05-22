const EVENTS = [
    {
        type: "SYSCALL_EVENT",
        severity: "WARNING",
        caller: "EBPF_AGENT",
        message: "Suspicious execve detected: /bin/sh",
        data: { pid: 9999, comm: "sh", syscall: "execve" }
    },
    {
        type: "FILE_ALERT",
        severity: "CRITICAL",
        caller: "FIM_GUARD",
        message: "UNAUTHORIZED_ACCESS DENIED for /etc/shadow",
        data: { pid: 9999, comm: "sh", action: "DENIED" }
    },
    {
        type: "EXFIL_ALERT",
        severity: "CRITICAL",
        caller: "PCAP_ENGINE",
        message: "TLS Connection to: malware-c2.com",
        data: { pid: 9999, comm: "sh", ip: "1.2.3.4", protocol: "TLS/SNI" }
    }
];

// We will inject these via the EventMediator during the test
console.log("Tactical Breach Simulation Sequence Loaded.");
