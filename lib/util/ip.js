// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

const v4Seg = '(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])'
const v4Str = `(${v4Seg}[.]){3}${v4Seg}`
const IPv4Pattern = new RegExp(`^${v4Str}$`)

const v6Seg = '(?:[0-9a-fA-F]{1,4})'
const IPv6Pattern = new RegExp('^(' +
    `(?:${v6Seg}:){7}(?:${v6Seg}|:)|` +
    `(?:${v6Seg}:){6}(?:${v4Str}|:${v6Seg}|:)|` +
    `(?:${v6Seg}:){5}(?::${v4Str}|(:${v6Seg}){1,2}|:)|` +
    `(?:${v6Seg}:){4}(?:(:${v6Seg}){0,1}:${v4Str}|(:${v6Seg}){1,3}|:)|` +
    `(?:${v6Seg}:){3}(?:(:${v6Seg}){0,2}:${v4Str}|(:${v6Seg}){1,4}|:)|` +
    `(?:${v6Seg}:){2}(?:(:${v6Seg}){0,3}:${v4Str}|(:${v6Seg}){1,5}|:)|` +
    `(?:${v6Seg}:){1}(?:(:${v6Seg}){0,4}:${v4Str}|(:${v6Seg}){1,6}|:)|` +
    `(?::((?::${v6Seg}){0,5}:${v4Str}|(?::${v6Seg}){1,7}|:))` +
    ')(%[0-9a-zA-Z-.:]{1,})?$')

export function isIPv4 (host) {
    return IPv4Pattern.test(host)
}

export function isIPv6 (host) {
    return IPv6Pattern.test(host)
}

export function isIP (host) {
    if (isIPv4(host)) return 4
    if (isIPv6(host)) return 6
    return 0
}

/// ****** End Copyright Protected Code ******

export function isIpInSubnet(ip, subnet) {
    // Split the subnet into basePeer and mask length (if provided)
    let [subnetBase, subnetMaskLength] = subnet.split('/');

    // Set a default subnet mask to /32 if none is provided
    subnetMaskLength = subnetMaskLength ? Number(subnetMaskLength) : 32;

    // Convert IP and subnet basePeer to binary form
    const ipBinary = ipToBinary(ip);
    const subnetBinary = ipToBinary(subnetBase);

    // If the subnet basePeer is '0.0.0.0', treat it as a wildcard (match any IP)
    if (subnetBase === '0.0.0.0') {
        return true; // Wildcard: matches any IP
    }

    // Calculate subnet mask
    const subnetMask = -1 << (32 - subnetMaskLength);

    // Check if the masked IP matches the masked subnet
    return (ipBinary & subnetMask) === (subnetBinary & subnetMask);
}

// Helper function to convert IP to binary
function ipToBinary(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) | Number(octet), 0);
}

function isLoopbackIp(ip) {
    return ip.startsWith("127.");
}

function generateIpPool(startingIp, subnetMask) {
    const pool = [];
    const ipParts = startingIp.split('.').map(Number);
    const subnetBits = subnetMask;
    const hostBits = 32 - subnetBits;

    // Calculate max hosts only if hostBits > 0
    const maxHosts = hostBits > 0 ? 2 ** hostBits : 1;

    const baseIp = ipParts.slice(0, Math.floor(subnetBits / 8));

    // Pad baseIp to 4 octets
    while (baseIp.length < 4) baseIp.push(0);

    // For /32 subnet, add only the starting IP
    if (subnetMask === 32) {
        pool.push(startingIp);
        return pool;
    }

    // Generate IPs for subnets with host bits
    for (let host = 1; host < maxHosts - 1; host++) {
        const ip = [...baseIp];
        let remainingHosts = host;

        for (let i = 3; i >= Math.floor(subnetBits / 8); i--) {
            ip[i] += remainingHosts % 256;
            remainingHosts = Math.floor(remainingHosts / 256);
        }

        pool.push(ip.join('.'));
    }
    return pool;
}

function isCidrNotation(ipCidr) {
    // Split the IP and CIDR part (e.g., '192.168.1.0/24')
    const parts = ipCidr.split('/');
    if (parts.length !== 2) return false;

    const [ip, maskLength] = parts;

    // Check if the IP is valid and mask length is between 0 and 32
    return isIPv4(ip) && !isNaN(maskLength) && Number(maskLength) >= 0 && Number(maskLength) <= 32;
}

function getSubnetPrecedence(subnets, ip) {
    // Filter subnets containing the IP
    const matchingSubnets = subnets.filter(subnet => subnet.contains(ip));

    if (matchingSubnets.length === 0) return null;

    // Sort by prefix length, then by priority
    matchingSubnets.sort((a, b) => {
        const prefixDiff = b.prefix - a.prefix; // Longer prefix first
        return prefixDiff !== 0 ? prefixDiff : b.priority - a.priority; // Higher priority first
    });

    // Return the highest precedence subnet
    return matchingSubnets[0];
}

function binaryToIp(binary) {
    const octets = [];
    for (let i = 0; i < 4; i++) {
        octets.unshift(binary & 0xFF);
        binary = binary >> 8;
    }
    return octets.join('.');
}

function getNetworkAndBroadcastIp(subnet) {
    const [ip, mask] = subnet.split('/');
    const subnetMask = parseInt(mask, 10);

    // Convert IP to binary
    const ipBinary = ipToBinary(ip);

    // Calculate network IP (masking the IP)
    const networkIpBinary = ipBinary & (-1 << (32 - subnetMask));

    // Calculate broadcast IP (filling the host bits with 1s)
    const broadcastIpBinary = ipBinary | ~( -1 << (32 - subnetMask));

    // Convert binary IPs back to dotted-decimal format
    const networkIp = binaryToIp(networkIpBinary);
    const broadcastIp = binaryToIp(broadcastIpBinary);

    return { networkIp, broadcastIp };
}

export {
    ipToBinary,
    binaryToIp,
    generateIpPool,
    isLoopbackIp,
    isCidrNotation,
    getSubnetPrecedence,
    getNetworkAndBroadcastIp
};