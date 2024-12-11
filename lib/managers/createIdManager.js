import b4a from "b4a";
import { IpAllocator } from "../util/IpAllocator.js";

const noopTrue = () => true;

// Utility to convert ID to hex
const toHex = id => b4a.toString(id, "hex");

// Generic ID manager
const idManager = (name, allocate, verify = id => taken.has(id), release = id => taken.delete(id)) => {
    const taken = new Set();

    const _allocate = allocate;
    allocate = id => {
        if (taken.has(id)) return null;
        const newId = _allocate(id);
        if (newId) {
            taken.add(newId);
            return newId;
        }
        return null;
    };

    return {
        taken,
        name,
        allocate,
        verify,
        release,
    };
};

// ID Pool System
const createIdPoolSystem = (pool, config = {}) => {
    const { from = "random" } = config;

    if (!["first", "last", "random"].includes(from)) {
        throw new Error("From must be 'first' | 'last' | 'random'.");
    }

    const clonedPool = [...pool]; // Clone pool to prevent mutation of external array

    const manager = idManager(
        "finite",
        id => {
            let value;
            if (clonedPool.length === 0) return false;

            if (id) {
                const idx = clonedPool.findIndex(item => item === id);
                if (idx === -1) return false; // ID not found
                value = clonedPool.splice(idx, 1)[0];
            } else {
                switch (from) {
                    case "random": {
                        const randomIndex = Math.floor(Math.random() * clonedPool.length);
                        value = clonedPool.splice(randomIndex, 1)[0];
                        break;
                    }
                    case "first": {
                        value = clonedPool.shift();
                        break;
                    }
                    case "last": {
                        value = clonedPool.pop();
                        break;
                    }
                }
            }
            return value;
        },
        undefined,
        id => manager.taken.delete(id) && clonedPool.push(id) && true
    );

    return manager;
};

// IP ID System
const createIpIdSystem = subnet => {
    const allocator = new IpAllocator(subnet);

    const manager = idManager(
        "ip",
        () => allocator.allocateIp(),
        ip => !allocator.isIpAvailable(ip),
        ip => allocator.releaseIp(ip)
    );

    return {
        ...manager,
        allocator,
    };
};

// Infinite ID System
const createInfiniteIdSystem = generator => {
    if (typeof generator !== "function") {
        throw new Error("generator argument must be a function");
    }

    return idManager("infinite", generator, noopTrue, noopTrue);
};

// Public Key ID System
const createPublicKeyIdSystem = () => {
    const manager = idManager("publicKey");

    return {
        ...manager,
        allocate(id) {
            const hex = toHex(id);
            if (manager.verify(hex)) return false;
            return manager.allocate(hex);
        },
        release(id) {
            return manager.release(toHex(id));
        },
        verify(id) {
            return manager.verify(toHex(id));
        },
    };
};

// Two-Stage System
const createTwoStage = (stage1, stage2) => {
    return [
        {
            ...stage1,
            allocate: id => stage1.allocate(id),
            release: id => stage1.release(id),
            verify: id => stage1.verify(id),
        },
        {
            ...stage2,
            allocate: (oldId, newId) => stage1.release(oldId) && stage2.allocate(newId),
            release: id => stage2.release(id),
            verify: id => stage2.verify(id),
        },
    ];
};

export {
    createPublicKeyIdSystem,
    createInfiniteIdSystem,
    createIdPoolSystem,
    createIpIdSystem,
    createTwoStage,
};
