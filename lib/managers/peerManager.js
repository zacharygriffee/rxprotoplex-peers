import {from, map, merge, mergeAll, of, ReplaySubject, takeUntil} from "rxjs";
import {createStore, filterNil} from "@ngneat/elf";
import {
    addActiveIds,
    deleteEntities,
    getActiveEntities,
    getActiveIds, getAllEntities,
    removeActiveIds,
    resetActiveIds,
    selectActiveEntities,
    selectActiveIds,
    toggleActiveIds,
    upsertEntities,
    withActiveIds,
    withEntities
} from "@ngneat/elf-entities";
import {castArray} from "../util/castArray.js";
import {ID_SYMBOL} from "../constants.js";
import {idOf} from "../peer/idOf.js";
import {destroy, get} from "rxprotoplex";

const peerStores = new Map();
let defaultIdMap = (e) => e.id;

/**
 * Sets the default ID mapping function or property string for peer managers.
 *
 * @param {Function|string} fnOrString - A function to map entities to IDs, or a property string to use for ID mapping.
 */
const setDefaultIdMap = (fnOrString) => defaultIdMap = fnOrString;

/**
 * Creates a Peer Manager for managing peer connections and their states.
 *
 * @param {string} name - The name of the peer manager instance.
 * @param {Function|string} [idMap=defaultIdMap] - A function or property string to map connections to unique IDs. Defaults to `defaultIdMap`.
 * @returns {Object} An object representing the peer manager with methods for managing connections and state.
 */
const peerManager = (name, idMap = defaultIdMap) => {
    /**
     * A subject that emits a value when the peer manager is closed.
     * @type {ReplaySubject<any>}
     */
    const close$ = new ReplaySubject(1);

    /**
     * A store for managing peers and their states.
     * @type {Object}
     */
    const store = createStore(
        { name },
        withEntities({ idKey: ID_SYMBOL }),
        withActiveIds()
    );

    /**
     * The peer manager object with methods for managing connections and activity.
     */
    const peers = Object.assign(store, {
        /**
         * Closes the peer manager, cleaning up connections and emitting a close event.
         * @param {any} [e] - An optional parameter to emit on closure.
         */
        close(e) {
            store.query(getAllEntities()).forEach(p => destroy(p, e));
            close$.next(e);
        },

        /**
         * Attaches connections to the peer manager.
         * @param {Observable|Observable[]} connections$ - Observable(s) emitting connections.
         * @param {Function|string} [_idMap] - Optional custom ID mapping function or property string.
         * @returns {Observable} The provided observable of connections.
         */
        attach(connections$, _idMap) {
            if (Array.isArray(connections$)) return peers.attach(merge(...connections$), _idMap);
            connections$
                .pipe(takeUntil(close$))
                .subscribe(connection => {
                    if (!connection[ID_SYMBOL])
                        [connection[ID_SYMBOL]] = this.getId(connection, _idMap);
                    if (!connection[ID_SYMBOL]) throw new Error("Peer connection must have a valid ID");
                    store.update(upsertEntities(connection));
                });
            return connections$;
        },

        /**
         * Detaches connections from the peer manager.
         * @param {Observable|Observable[]} connections$ - Observable(s) emitting connections.
         */
        detach(connections$) {
            if (Array.isArray(connections$)) return peers.detach(merge(...connections$));
            connections$
                .pipe(takeUntil(close$), map(idOf))
                .subscribe(id => {
                    store.update(deleteEntities(id));
                });
        },

        /**
         * Observable emitting the currently active peer connections.
         * @type {Observable}
         */
        connection$: store.pipe(selectActiveEntities(), mergeAll(), filterNil()),

        /**
         * Activates a peer connection by its ID.
         * @param {string|string[]} id - The ID(s) of the connection(s) to activate.
         */
        activate(id) {
            store.update(addActiveIds(castArray(id)));
        },

        /**
         * Toggles the active state of a peer connection by its ID.
         * @param {string|string[]} id - The ID(s) of the connection(s) to toggle.
         */
        toggleActive(id) {
            store.update(toggleActiveIds(castArray(id)));
        },

        /**
         * Deactivates a peer connection by its ID.
         * @param {string|string[]} id - The ID(s) of the connection(s) to deactivate.
         */
        deactivate(id) {
            store.update(removeActiveIds(castArray(id)));
        },

        /**
         * Resets all active connections to inactive state.
         */
        resetActivity() {
            store.update(resetActiveIds());
        },

        /**
         * Retrieves the currently active connection IDs.
         * @returns {string[]} An array of active connection IDs.
         */
        getActive() {
            return store.query(getActiveIds);
        },

        /**
         * Retrieves the currently active connection entities.
         * @returns {Object[]} An array of active connection entities.
         */
        getActiveEntities() {
            return store.query(getActiveEntities());
        },

        /**
         * Returns an observable of active connection IDs.
         * @returns {Observable}
         */
        selectActive$() {
            return store.pipe(selectActiveIds());
        },

        /**
         * Returns an observable of active connection entities.
         * @returns {Observable}
         */
        selectActiveEntities$() {
            return store.pipe(selectActiveEntities());
        },

        /**
         * Generates a unique ID for a connection using the specified ID mapping.
         * @param {Object|Object[]} entity - The connection entity or entities.
         * @param {Function|string} [_idMap=idMap] - Optional custom ID mapping function or property string.
         * @returns {string|string[]} The generated ID(s).
         */
        getId(entity, _idMap = idMap) {
            if (typeof _idMap === "string") {
                const str = _idMap;
                _idMap = (e) => get(e, str);
            }
            return castArray(entity).map(_idMap);
        }
    });

    peerStores.set(name, peers);
    return peers;
};

/**
 * Retrieves an existing Peer Manager by its name.
 *
 * @param {string} name - The name of the peer manager to retrieve.
 * @returns {Object|undefined} The peer manager object if found, or `undefined` if no peer manager exists with the given name.
 */
const getPeerManager = (name) => {
    return peerStores.get(name);
};

export {getPeerManager};
export {peerManager};
export {setDefaultIdMap};