import {tapExpose} from "rxprotoplex-rpc";
import {ID_SYMBOL} from "../constants.js";
import {getEntity, getEntityByPredicate} from "@ngneat/elf-entities";
import {webrtcExchangeByRelay} from "./webrtcExchangeByRelay.js";
import {firstValueFrom, race, take} from "rxjs";
import {idOf} from "../socket/idOf.js";
import {serverSocketEntitiesRef, store} from "../store.js";

const connectionsInProgress = new Map();
/**
 * Creates a webrtcSignalingRelay for managing socket-to-socket connections and WebRTC signaling.
 *
 * @param {Object} [peer=manager] - The socket instance to associate with the webrtcSignalingRelay. Defaults to the manager.
 * @returns {Object} An object with webrtcSignalingRelay functionalities exposed as RPC methods.
 */
export const webrtcSignalingRelay = (peer) =>
    tapExpose({
        /**
         * Retrieves the ID of the current socket.
         *
         * @returns {Promise<string>} A promise that resolves to the socket's ID.
         */
        async getId() {
            return peer[ID_SYMBOL];
        },

        /**
         * Establishes a connection between the current socket and another socket by ID.
         *
         * @param {string} id - The ID of the socket to connect to.
         * @returns {Promise<boolean>} A promise that resolves to `false` if the connection cannot be established or if the peers are the same.
         */
        /**
         * Establishes a WebRTC connection between two peers, ensuring that duplicate connections are avoided.
         *
         * @param {string} id - The ID of the remote peer to connect to.
         * @returns {Promise<boolean>} Resolves to `true` if the connection was successfully established, `false` otherwise.
         */
        async connect(id) {
            // Prevent self-connection.
            if (peer[ID_SYMBOL] === id) return false;

            // Retrieve the remote and local peer entities from the store.
            const remotePeer = store.query(
                getEntityByPredicate(({ ip }) => ip === id, { ref: serverSocketEntitiesRef })
            );
            const localPeer = store.query(
                getEntity(peer[ID_SYMBOL], { ref: serverSocketEntitiesRef })
            );

            // Validate IPs and prevent redundant connections.
            if (
                !remotePeer?.ip || !localPeer?.ip ||
                remotePeer.ip === localPeer.ip
            ) {
                return false;
            }

            // Determine polite and impolite peers based on IP order.
            const [impolite, polite] = [remotePeer, localPeer].sort((a, b) => a.ip.localeCompare(b.ip));

            if (!impolite || !polite) return false;

            // Create a unique key for the connection to avoid duplicates.
            const key = `${idOf(impolite)}#${idOf(polite)}`;

            // Check if a connection is already in progress.
            if (connectionsInProgress.has(key)) {
                return connectionsInProgress.get(key);
            }

            // Initiate the WebRTC connection process.
            const process = firstValueFrom(webrtcExchangeByRelay(impolite, polite));
            connectionsInProgress.set(key, process);

            try {
                const result = await process;

                // Clean up the connection state if either peer closes.
                race(impolite.close$, polite.close$).pipe(take(1)).subscribe(() => {
                    connectionsInProgress.delete(key);
                });

                return result;
            } catch (error) {
                console.error(`Connection failed between ${idOf(impolite)} and ${idOf(polite)}`, error);
                connectionsInProgress.delete(key);
                return false;
            }
        },

        /**
         * Relays an ICE candidate to another socket.
         *
         * @param {string} to - The ID of the socket to receive the ICE candidate.
         * @param {Object} ice - The ICE candidate to webrtcSignalingRelay.
         * @returns {boolean} `true` if the ICE candidate was successfully relayed, otherwise `false`.
         */
        relayIce(to, ice) {
            console.debug(`[RPC relayIce] Relaying ICE candidate to IP: ${to}`);
            const toPeer = store.query(getEntityByPredicate(e => e.ip === to, { ref: serverSocketEntitiesRef }));
            const localPeer = store.query(getEntity(peer[ID_SYMBOL], { ref: serverSocketEntitiesRef }));
            if (!toPeer) {
                console.warn(`[RPC relayIce] No peer found for IP: ${to}`);
                return false;
            }
            console.debug(`[RPC relayIce] Found peer. Relaying ICE candidate:`, ice);
            toPeer.rpc.notify.receiveIce(localPeer.ip, ice);
            return true;
        }
    });

