import {fromWebSocket} from 'rxprotoplex-websocket';
import {basePeer} from './base-peer.js';

/**
 * Creates a WebSocket-based peer by combining a WebSocket connection with the base peer functionality.
 *
 * @param {string} id - The unique identifier for the peer.
 * @param {string|WebSocket} urlOrSocket - A WebSocket instance or the URL for creating a WebSocket connection.
 * @param {Object} [config] - Optional configuration for the WebSocket connection.
 * @returns {Object} A peer object enhanced with WebSocket-based functionality.
 */
export const webSocketPeer = (id, urlOrSocket, config) =>
    basePeer(id, fromWebSocket(urlOrSocket, config));
