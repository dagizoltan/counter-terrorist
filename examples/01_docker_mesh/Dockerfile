FROM denoland/deno:ubuntu-2.0.2

# Install dependencies for Rust, building agents, and security tools
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    iptables \
    iproute2 \
    ufw \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app

# Copy dependency files first for caching
COPY src/agents/Cargo.toml src/agents/Cargo.lock ./src/agents/
COPY deno.json deno.lock ./

# Copy the rest of the source
COPY . .

# Build Rust agents (Excluding ebpf for faster demo build; orchestrator will use fallback)
RUN cd src/agents && cargo build --release --workspace --exclude ebpf --exclude ebpf-ebpf

# Expose the API port and mDNS port
EXPOSE 8000
EXPOSE 5353/udp

# We use the 'start' task from deno.json which includes all necessary permissions
CMD ["deno", "task", "start"]
