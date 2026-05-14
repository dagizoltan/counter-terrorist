export interface NetworkLogEntry {
    direction: "INBOUND" | "OUTBOUND";
    source: string;
    destination: string;
    protocol: string;
    length: number;
    action: "ALLOW" | "BLOCK";
    timestamp?: string;
    metadata?: any;
    botScore?: number;
}

export interface NetworkLogRepository {
    save(entry: NetworkLogEntry): Promise<void>;
    getLatest(limit: number): Promise<NetworkLogEntry[]>;
}
