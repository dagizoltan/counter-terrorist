export interface ProcessInfo {
    pid: number;
    ppid: number;
    comm: string;
}

export interface ProcessPort {
    getProcessInfo(pid: number): Promise<ProcessInfo | null>;
    listProcesses(): AsyncIterable<number>;
    getAllProcesses(): Promise<ProcessInfo[]>;
    isAlive(pid: number): boolean;
    getOwnPid(): number;
}
