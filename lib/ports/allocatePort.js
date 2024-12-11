const allocatePort = pool => {
    try {
        return pool.allocate();
    } catch (error) {
        console.error("Failed to allocate port:", error.message);
        return null;
    }
};

export {allocatePort}