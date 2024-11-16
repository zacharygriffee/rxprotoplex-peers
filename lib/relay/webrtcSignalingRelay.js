import {tapExpose} from "rxprotoplex-rpc";
import {ID_SYMBOL} from "../constants.js";
import {getEntitiesCount, getEntitiesIds, getEntity} from "@ngneat/elf-entities";
import {webrtcExchangeByRelay} from "./webrtcExchangeByRelay.js";
/**
 * Creates a webrtcSignalingRelay for managing peer-to-peer connections and WebRTC signaling.
 *
 * @param {Object} manager - The peer manager instance used for managing connections and entities.
 * @param {Object} [peer=manager] - The peer instance to associate with the webrtcSignalingRelay. Defaults to the manager.
 * @returns {Object} An object with webrtcSignalingRelay functionalities exposed as RPC methods.
 */
export const webrtcSignalingRelay = (manager, peer = manager) =>
    tapExpose({
        /**
         * Retrieves the ID of the current peer.
         *
         * @returns {Promise<string>} A promise that resolves to the peer's ID.
         */
        async getId() {
            return peer[ID_SYMBOL];
        },

        /**
         * Establishes a connection between the current peer and another peer by ID.
         *
         * @param {string} id - The ID of the peer to connect to.
         * @returns {Promise<boolean>} A promise that resolves to `false` if the connection cannot be established or if the peers are the same.
         */
        async connect(id) {
            if (peer[ID_SYMBOL] === id) return false;

            const [impolite, polite] = [id, peer[ID_SYMBOL]]
                .sort()
                .map(id => manager.query(getEntity(id)));

            if (!impolite || !polite) return false;
            webrtcExchangeByRelay(impolite, polite);
        },

        /**
         * Retrieves the total number of peers managed by the webrtcSignalingRelay.
         *
         * @returns {Promise<number>} A promise that resolves to the count of peers.
         */
        async peerCount() {
            return manager.query(getEntitiesCount());
        },

        /**
         * Retrieves the IDs of all peers managed by the webrtcSignalingRelay.
         *
         * @returns {Promise<string[]>} A promise that resolves to an array of peer IDs.
         */
        async getPeers() {
            return manager.query(getEntitiesIds());
        },

        /**
         * Relays an ICE candidate to another peer.
         *
         * @param {string} to - The ID of the peer to receive the ICE candidate.
         * @param {Object} ice - The ICE candidate to webrtcSignalingRelay.
         * @returns {boolean} `true` if the ICE candidate was successfully relayed, otherwise `false`.
         */
        relayIce(to, ice) {
            const toPeer = manager.query(getEntity(to));
            if (!toPeer) return false;
            toPeer.rpc.notify.receiveIce(peer[ID_SYMBOL], ice);
            return true;
        }
    });

