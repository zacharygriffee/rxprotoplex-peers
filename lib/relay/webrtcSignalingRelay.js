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
        async connect(id) {
            if (peer[ID_SYMBOL] === id) return false;

            const remotePeer = store.query(getEntityByPredicate(({ ip }) => ip === id , {ref: serverSocketEntitiesRef}));
            const localPeer = store.query(getEntity(peer[ID_SYMBOL], {ref: serverSocketEntitiesRef}));
            if (remotePeer.ip === localPeer.ip || !remotePeer.ip || !localPeer.ip) return false;
            const [impolite, polite] = [remotePeer, localPeer]
                .sort(o => o.ip);

            if (!impolite || !polite) return false;
            const key = idOf(impolite) + "#" + idOf(polite);

            if (connectionsInProgress.has(key))
                return connectionsInProgress.get(key);
            const process = firstValueFrom(webrtcExchangeByRelay(impolite, polite));
            connectionsInProgress.set(key, process);
            const result = await process;
            race(impolite.close$, polite.close$).pipe(take(1)).subscribe(
                () => connectionsInProgress.delete(key)
            );
            return result;
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

