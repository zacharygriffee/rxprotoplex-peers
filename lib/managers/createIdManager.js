import b4a from "b4a";
import { IpAllocator } from "../util/IpAllocator.js";

/**
 * No-op function that always returns `true`.
 * @returns {boolean} Always `true`.
 */
const noopTrue = () => true;

/**
 * Converts a buffer ID to a hex string.
 * @param {Uint8Array} id - The ID buffer.
 * @returns {string} The hex representation of the ID.
 */
const toHex = id => b4a.toString(id, "hex");

/**
 * Generic ID manager for allocation, verification, and release of IDs.
 *
 * @param {string} name - The name of the ID manager.
 * @param {Function} allocate - The function to allocate IDs.
 * @param {Function} [verify] - The function to verify IDs. Defaults to checking `taken`.
 * @param {Function} [release] - The function to release IDs. Defaults to removing from `taken`.
 * @returns {Object} The ID manager object.
 */
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

/**
 * Creates a finite ID pool system with allocation policies.
 *
 * @param {Array} pool - The array of available IDs.
 * @param {Object} [config={}] - Configuration options.
 * @param {string} [config.from="random"] - The allocation policy ("first", "last", or "random").
 * @returns {Object} The ID manager for the finite pool.
 */
const createIdPoolSystem = (pool, config = {}) => {
    const { from = "random" } = config;

    if (!["first", "last", "random"].includes(from)) {
        throw new Error("From must be 'first', 'last', or 'random'.");
    }

    const clonedPool = [...pool]; // Prevent external array mutation

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
                    case "random":
                        const randomIndex = Math.floor(Math.random() * clonedPool.length);
                        value = clonedPool.splice(randomIndex, 1)[0];
                        break;
                    case "first":
                        value = clonedPool.shift();
                        break;
                    case "last":
                        value = clonedPool.pop();
                        break;
                }
            }
            return value;
        },
        undefined,
        id => manager.taken.delete(id) && clonedPool.push(id) && true
    );

    return manager;
};

/**
 * Creates an IP-based ID system using a subnet allocator.
 *
 * @param {string} subnet - The subnet for IP allocation.
 * @param config
 * @returns {Object} The ID manager for the IP system.
 */
const createIpIdSystem = (subnet, config = {}) => {
    const allocator = new IpAllocator(subnet, config);

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

/**
 * Creates an infinite ID system using a custom generator.
 *
 * @param {Function} generator - The function to generate unique IDs.
 * @returns {Object} The ID manager for the infinite system.
 */
const createInfiniteIdSystem = generator => {
    if (typeof generator !== "function") {
        throw new Error("generator argument must be a function");
    }

    return idManager("infinite", generator, noopTrue, noopTrue);
};

/**
 * Creates a public key-based ID system.
 *
 * @returns {Object} The ID manager for the public key system.
 */
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

/**
 * Creates a two-stage ID allocation system.
 *
 * @param {Object} stage1 - The first stage manager.
 * @param {Object} stage2 - The second stage manager.
 * @returns {Array} The two-stage managers.
 */
const createTwoStage = (stage1, stage2) => [
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

export {
    createPublicKeyIdSystem,
    createInfiniteIdSystem,
    createIdPoolSystem,
    createIpIdSystem,
    createTwoStage,
};
