import {generateIpPool} from "./ip.js";

class IpAllocator {
    constructor(subnet) {
        const [ip, cidr] = subnet.split('/'); // Split subnet into IP and CIDR parts
        this.ipPool = generateIpPool(ip, Number(cidr)); // Generate the IP pool
        this.subnet = Number(cidr);
        // Automatically allocate the network and broadcast IPs
        this.networkIp = this.ipPool[0]; // First IP in the pool
        this.broadcastIp = this.ipPool[this.ipPool.length - 1]; // Last IP in the pool

        // Reserve network and broadcast IPs
        this.allocatedIps = new Set([this.networkIp, this.broadcastIp]);
        this.availableIps = this.ipPool.slice(1, -1); // Available IPs excluding first and last
    }

    // Allocate an IP from the available pool
    allocateIp() {
        if (this.availableIps.length === 0) {
            throw new Error('No available IPs in the pool');
        }

        const allocatedIp = this.availableIps.shift(); // Get the first available IP
        this.allocatedIps.add(allocatedIp);
        return allocatedIp;
    }

    // Release an IP back to the available pool
    releaseIp(ip) {
        if (this.allocatedIps.has(ip) && ip !== this.networkIp && ip !== this.broadcastIp) {
            this.allocatedIps.delete(ip);
            this.availableIps.push(ip); // Add released IP back to the pool
        } else {
            throw new Error('Cannot release network/broadcast IP or IP not allocated');
        }
    }

    // Check if an IP is available
    isIpAvailable(ip) {
        return !this.allocatedIps.has(ip) && this.ipPool.includes(ip);
    }

    // Get the network IP
    getNetworkIp() {
        return this.networkIp;
    }

    // Get the broadcast IP
    getBroadcastIp() {
        return this.broadcastIp;
    }

    // Get the list of allocated IPs
    getAllocatedIps() {
        return Array.from(this.allocatedIps);
    }

    // Get the list of available IPs
    getAvailableIps() {
        return this.availableIps;
    }
}

export {IpAllocator};
