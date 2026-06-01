type SyslogTransportType = "udp" | "tcp" | "tls";

export class SyslogTransport {
    private persistentConn: Deno.Conn | Deno.TlsConn | Deno.DatagramConn | null = null;

    constructor(
        private remoteHost: string,
        private remotePort: number,
        private transportType: SyslogTransportType,
        private tlsCaCertPath: string | null
    ) {}

    async send(logs: string[]) {
        switch (this.transportType) {
            case "udp": await this.sendUdp(logs); break;
            case "tcp": await this.sendTcpOrTls(logs, false); break;
            case "tls": await this.sendTcpOrTls(logs, true); break;
        }
    }

    private async sendUdp(logs: string[]) {
        const conn = await this.getOrCreateUdpConnection();
        const encoder = new TextEncoder();
        for (const log of logs) {
            await conn.send(encoder.encode(log), { hostname: this.remoteHost, port: this.remotePort, transport: "udp" });
        }
    }

    private async getOrCreateUdpConnection(): Promise<Deno.DatagramConn> {
        if (this.persistentConn && "send" in this.persistentConn) {
            return this.persistentConn as Deno.DatagramConn;
        }
        this.close();
        this.persistentConn = Deno.listenDatagram({ port: 0, transport: "udp" });
        return this.persistentConn as Deno.DatagramConn;
    }

    private async sendTcpOrTls(logs: string[], useTls: boolean) {
        const conn = await this.getOrCreateConnection(useTls);
        const encoder = new TextEncoder();
        for (const log of logs) {
            const msgBytes = encoder.encode(log);
            const frame = encoder.encode(`${msgBytes.length} `);
            const combined = new Uint8Array(frame.length + msgBytes.length);
            combined.set(frame);
            combined.set(msgBytes, frame.length);
            await conn.write(combined);
        }
    }

    private async getOrCreateConnection(useTls: boolean): Promise<Deno.Conn | Deno.TlsConn> {
        if (this.persistentConn && "write" in this.persistentConn) {
            return this.persistentConn as Deno.Conn | Deno.TlsConn;
        }
        this.close();
        if (useTls) {
            const options: Deno.ConnectTlsOptions = { hostname: this.remoteHost, port: this.remotePort };
            if (this.tlsCaCertPath) {
                try {
                    const caCert = await Deno.readTextFile(this.tlsCaCertPath);
                    options.caCerts = [caCert];
                } catch { /* ignore */ }
            }
            this.persistentConn = await Deno.connectTls(options);
        } else {
            this.persistentConn = await Deno.connect({ hostname: this.remoteHost, port: this.remotePort });
        }
        return this.persistentConn as Deno.Conn | Deno.TlsConn;
    }

    close() {
        if (this.persistentConn) {
            try { this.persistentConn.close(); } catch { /* ignore */ }
            this.persistentConn = null;
        }
    }
}
