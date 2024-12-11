const releasePort = (pool, port) => {
    try {
        pool.release(port);
        console.log(`Port ${port} released.`);
    } catch (error) {
        console.error("Failed to release port:", error.message);
    }
};

export {releasePort};