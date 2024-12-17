import {ID_SYMBOL} from "../constants.js";
import {interfacesEntitiesRef, onStoreReset$, store} from "../store.js";
import {addEntities} from "@ngneat/elf-entities";
import {enableLocalSocketPair} from "../socket/socket.js";
import {take} from "rxjs";

export let lo = undefined;
export const enableLocalHostInterface = (config = {}) => {
    if (lo) return "lo";
    const id = `lo`; // Unique identifier for this interface

    const iface = {
        [ID_SYMBOL]: id,
        ip: `127.0.0.1`,
        rpc: null,
    };

    // Store the interface
    store.update(addEntities(iface, {ref: interfacesEntitiesRef}));
    enableLocalSocketPair();
    lo = iface;
    onStoreReset$.pipe(take(1)).subscribe(() => lo = undefined);
    return "lo";
};