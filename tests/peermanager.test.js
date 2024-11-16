import {test, solo} from "brittle";
import {of, take} from "rxjs";
import {deleteAllEntities, getEntity, selectEntity} from "@ngneat/elf-entities";
import {getPeerManager, peerManager} from "../lib/managers/peerManager.js";

test("basic webrtcSignalingRelay manager", t => {
    const p = peerManager("debug");
    p.attach([
        of({id: "a", hello: () => "world"}),
        of({id: "b", hello: () => "friend"})
    ]);
    p.pipe(selectEntity("a"), take(1)).subscribe(
        (entity) => t.is(entity.hello(), "world")
    );
    const entityA = p.query(getEntity("a"));
    const entityB = p.query(getEntity("b"));
    t.is(entityA.hello(), "world");
    t.is(entityB.hello(), "friend");
    p.update(deleteAllEntities());
});

test("basic webrtcSignalingRelay manager idMap as function", t => {
    const p = peerManager("debug");
    p.attach([
        of({martini: "a", hello: () => "world"}),
        of({martini: "b", hello: () => "friend"})
    ], (e) => e.martini);
    p.pipe(selectEntity("a"), take(1)).subscribe(
        (entity) => t.is(entity.hello(), "world")
    );
    const entityA = p.query(getEntity("a"));
    const entityB = p.query(getEntity("b"));
    t.is(entityA.hello(), "world");
    t.is(entityB.hello(), "friend");
    p.update(deleteAllEntities());
});

test("basic webrtcSignalingRelay manager idMap as string", t => {
    const p = peerManager("debug");
    p.attach([
        of({martini: "a", hello: () => "world"}),
        of({martini: "b", hello: () => "friend"})
    ], "martini");
    p.pipe(selectEntity("a"), take(1)).subscribe(
        (entity) => t.is(entity.hello(), "world")
    );
    const entityA = p.query(getEntity("a"));
    const entityB = p.query(getEntity("b"));
    t.is(entityA.hello(), "world");
    t.is(entityB.hello(), "friend");
    p.update(deleteAllEntities());
});

test("get peerManager by peerManager name", t => {
    peerManager("debug");
    getPeerManager("debug").attach([
        of({id: "a", hello: () => "world"}),
        of({id: "b", hello: () => "friend"})
    ]);
    getPeerManager("debug").pipe(selectEntity("a"), take(1)).subscribe(
        (entity) => t.is(entity.hello(), "world")
    );
    const entityA = getPeerManager("debug").query(getEntity("a"));
    const entityB = getPeerManager("debug").query(getEntity("b"));
    t.is(entityA.hello(), "world");
    t.is(entityB.hello(), "friend");
    getPeerManager("debug").update(deleteAllEntities());
});

test("activate and deactivate peerManager", t => {
    const p = peerManager("debug");
    p.attach([
        of({id: "a", hello: () => "world"}),
        of({id: "b", hello: () => "friend"}),
        of({id: "c", hello: () => "enemy"})
    ]);
    p.activate(["a", "c"]);
    let actives = p.getActive();
    t.is(actives.length, 2);
    t.alike(actives, ["a", "c"]);
    p.deactivate("a");
    actives = p.getActive();
    t.is(actives.length, 1);
    t.alike(actives, ["c"]);
    p.update(deleteAllEntities());
});