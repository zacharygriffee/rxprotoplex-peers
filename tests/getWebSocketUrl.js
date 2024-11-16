export function getWebSocketURL(server) {
    const address = server.address();
    const protocol = server.options?.secure ? 'wss' : 'ws'; // Use 'wss' for secure WebSocket
    const host = (address.family === 'IPv6') ? `[${address.address}]` : address.address; // Enclose IPv6 in brackets
    return `${protocol}://${host}:${address.port}`;
}