import {createStore} from "@ngneat/elf";
import {
    deleteAllEntities,
    entitiesPropsFactory,
    getAllEntities,
    withActiveIds,
    withEntities
} from "@ngneat/elf-entities";
import {ID_SYMBOL} from "./constants.js";
import {destroy} from "rxprotoplex";
import {Subject} from "rxjs";

// Create entity properties for interfaces, sockets, and server sockets
const { withInterfacesEntities, interfacesEntitiesRef } = entitiesPropsFactory("interfaces");
const { withSocketEntities, socketEntitiesRef } = entitiesPropsFactory("socket");
const { withServerSocketEntities, serverSocketEntitiesRef } = entitiesPropsFactory("serverSocket");

/**
 * Reference for managing interface entities in the store.
 */
export { interfacesEntitiesRef };

/**
 * Reference for managing socket entities in the store.
 */
export { socketEntitiesRef };

/**
 * Reference for managing server socket entities in the store.
 */
export { serverSocketEntitiesRef };

/**
 * Observable triggered when the store is reset.
 * @type {Subject<Error>}
 */
export const onStoreReset$ = new Subject();

/**
 * The main store for managing all entities.
 */
export const store = createStore(
    { name: "manager" },
    withEntities({ idKey: ID_SYMBOL }),
    withInterfacesEntities({ idKey: ID_SYMBOL }),
    withSocketEntities({ idKey: ID_SYMBOL }),
    withServerSocketEntities({ idKey: ID_SYMBOL }),
    withActiveIds()
);

/**
 * Resets the store and cleans up all managed entities.
 *
 * @param {Error} [error] - Optional error to propagate during store reset.
 */
export const resetStore = (error) => {
    // Destroy all entities in the store
    store.query(getAllEntities());
    store.query(getAllEntities({ ref: serverSocketEntitiesRef }))
        .forEach(o => destroy(o));
    store.query(getAllEntities({ ref: socketEntitiesRef }))
        .forEach(o => destroy(o.plex));
    store.query(getAllEntities({ ref: interfacesEntitiesRef }))
        .forEach(o => destroy(o.plex));

    // Remove all entities from the store
    store.update(
        deleteAllEntities(),
        deleteAllEntities({ ref: serverSocketEntitiesRef }),
        deleteAllEntities({ ref: socketEntitiesRef }),
        deleteAllEntities({ ref: interfacesEntitiesRef })
    );

    // Notify observers of the reset event
    onStoreReset$.next(error);
};

