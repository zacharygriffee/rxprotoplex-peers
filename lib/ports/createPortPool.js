const createPortPool = (start = 1024, end = 65535) => {
    const availablePorts = new Set(Array.from({ length: end - start + 1 }, (_, i) => start + i));
    return {
        allocate: () => {
            if (availablePorts.size === 0) throw new Error("No available ports.");
            const port = availablePorts.values().next().value;
            availablePorts.delete(port);
            return port;
        },
        release: (port) => {
            if (port < start || port > end) throw new Error("Invalid port.");
            availablePorts.add(port);
        },
        available: () => Array.from(availablePorts),
        count: () => availablePorts.size,
        take(port = 0) {
            if (port === 0) {
                return this.allocate();
            }
            if (!availablePorts.has(port)) {
                throw new Error(`Port ${port} is already in use`);
            }
            availablePorts.delete(port);
            return port;
        }
    };
};

export {createPortPool}