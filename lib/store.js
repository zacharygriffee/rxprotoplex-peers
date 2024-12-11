import {createStore} from "@ngneat/elf";
import {entitiesPropsFactory, withActiveIds, withEntities} from "@ngneat/elf-entities";
import {ID_SYMBOL} from "./constants.js";

const {withInterfacesEntities, interfacesEntitiesRef} = entitiesPropsFactory("interfaces");
const {withSocketEntities, socketEntitiesRef} = entitiesPropsFactory("socket");
const {withServerSocketEntities, serverSocketEntitiesRef} = entitiesPropsFactory("serverSocket");
export { interfacesEntitiesRef, socketEntitiesRef, serverSocketEntitiesRef };

const store = createStore(
    {name: "manager"},
    withEntities({ idKey: ID_SYMBOL }),
    withInterfacesEntities({ idKey: ID_SYMBOL }),
    withSocketEntities({ idKey: ID_SYMBOL }),
    withServerSocketEntities({ idKey: ID_SYMBOL }),
    withActiveIds()
);

export { store };

