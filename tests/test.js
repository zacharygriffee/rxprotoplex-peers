import {solo, test, skip} from "brittle";
import {WebSocketServer} from "ws";
import b4a from "b4a";
import {
    addWebSocketNetworkInterface,
    closeInterface,
    networkInterfaceConnected$,
    connectStream$,
    listenOnSocket$,
    webSocketServer,
    getInterfaceOfId,
    connect,
    resetStore,
    selectAllInterfaces$, enableLocalHostInterface, connectToAllInterfaces
} from "../index.js";
import {getWebSocketURL} from "../lib/util/getWebSocketUrl.js";
import {createPortPool} from "../lib/ports/createPortPool.js";
import {firstValueFrom, take} from "rxjs";

const portPool = createPortPool(20000, 30000);

async function useWebServer(cb, t) {
    const port = portPool.allocate();
    const wss = new WebSocketServer({port});
    await new Promise((resolve) => wss.once("listening", resolve));
    console.log(`Web socket server listening on ${port}`);
    const wsUrl = getWebSocketURL(wss);
    const server$ = webSocketServer(wss);
    await cb(wsUrl);
    wss.close();
    t?.teardown?.(async () => {
        wss.close();
        server$.close$.next();
        portPool.release(port);
        resetStore();
    });
}

test("LocalHost test", async t => {
    enableLocalHostInterface();
    t.plan(1);
    const iface = getInterfaceOfId("lo");
    connect(iface.ip, iface.ip);
    listenOnSocket$("127.0.0.1", "howdie").pipe(take(1)).subscribe(
        (socket) => {
            socket.once("data", (data) => {
                t.alike(data, b4a.from("hello2"), "Received correct message");

            });
        }
    );
    connectStream$(iface.ip, "howdie").pipe(take(1)).subscribe(
        (stream) => {
            stream.write(b4a.from("hello2"));
        },
        (err) => t.fail(err.message)
    );
});

test("enableLocalHost resetStore and reenableLocalHost", t => {
    enableLocalHostInterface();
    resetStore();
    enableLocalHostInterface();
    t.plan(1);
    const iface = getInterfaceOfId("lo");
    connect(iface.ip, iface.ip);
    listenOnSocket$("127.0.0.1", "howdie").pipe(take(1)).subscribe(
        (socket) => {
            socket.once("data", (data) => {
                t.alike(data, b4a.from("hello2"), "Received correct message");

            });
        }
    );
    connectStream$(iface.ip, "howdie").pipe(take(1)).subscribe(
        (stream) => {
            stream.write(b4a.from("hello2"));
        },
        (err) => t.fail(err.message)
    );
});
test("Send empty", async t => {
    t.plan(1);
    const iface = getInterfaceOfId("lo");
    connect(iface.ip, iface.ip);
    listenOnSocket$("127.0.0.1", "howdie").pipe(take(1)).subscribe(
        (socket) => {
            socket.once("data", (data) => {
                t.ok(b4a.equals(data, b4a.alloc(0)), "Received correct empty message");
            });
        }
    );
    // Send a message from nic1 to nic2
    connectStream$(iface.ip, "howdie").pipe(take(1)).subscribe(
        (stream) => {
            stream.write(b4a.alloc(0));
        },
        (err) => t.fail(err.message)
    );
});

test("WebSocket integration test", async (t) => {
    // Start WebSocket server
    await useWebServer(async wsUrl => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        // Wait until both interfaces are connected
        const connectionPromise = new Promise((resolve, reject) => {
            let connections = 0;
            const checkConnections = () => {
                connections++;
                if (connections === 2) resolve();
            };
            networkInterfaceConnected$(nic1).subscribe(checkConnections, reject);
            networkInterfaceConnected$(nic2).subscribe(checkConnections, reject);
        });

        await connectionPromise;
        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);
        let listenerSub;
        t.teardown(() => {
            closeInterface(nic2);
            closeInterface(nic1);
            listenerSub?.unsubscribe?.();
        });

        connect(iface1.ip, iface2.ip);

        // Set up listening on nic2
        const listenPromise = new Promise((resolve, reject) => {
            listenerSub = listenOnSocket$("0.0.0.0", "howdie").subscribe(
                (socket) => {
                    socket.on("data", (data) => {
                        t.alike(data, b4a.from("hello2"), "Received correct message");
                        resolve();
                    });
                },
                reject
            );
        });


        // Send a message from nic1 to nic2
        connectStream$(iface1.ip, "howdie").subscribe(
            (stream) => {
                stream.write(b4a.from("hello2"));
            },
            (err) => t.fail(err.message)
        );

        await listenPromise;
        t.pass("WebSocket integration test completed");
    }, t);
});

test("Concurrent WebSocket network interface connections", async (t) => {
    await useWebServer(async (wsUrl) => {
        const interfaces = Array.from({length: 10}).map(() =>
            addWebSocketNetworkInterface(wsUrl)
        );
        let subs = [];

        const connectionPromises = interfaces.map((iface) =>
            new Promise((resolve, reject) => {
                subs.push(networkInterfaceConnected$(iface).subscribe(resolve, reject));
            })
        );

        await Promise.all(connectionPromises);

        t.pass("All interfaces connected successfully");
        interfaces.forEach((i) => closeInterface(i));
        subs.forEach(sub => sub.unsubscribe());
    }, t);
});

test("closeInterface handles invalid or non-existent interfaces", async (t) => {
    t.exception.all(() => closeInterface("non_existent_iface"), "Throws error for non-existent interface");
    const ifaceId = addWebSocketNetworkInterface("ws://localhost:8080");
    closeInterface(ifaceId);
    t.pass();
});

test("Data flow between connected interfaces using connectStream$", async (t) => {
    await useWebServer(async (wsUrl) => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);

        connect(iface1.ip, iface2.ip);

        const messageReceived = new Promise((resolve, reject) => {
            listenOnSocket$("0.0.0.0", "testChannel").subscribe((socket) => {
                socket.on("data", (data) => {
                    t.alike(data, b4a.from("test_message"), "Received expected data");
                    resolve();
                });
            }, reject);
        });

        connectStream$(iface1.ip, "testChannel").subscribe((stream) => {
            stream.write(b4a.from("test_message"));
        });

        await messageReceived;
        t.pass("Message received and validated successfully");
    }, t);
});

test("Listening on a specified IP address", async (t) => {
    await useWebServer(async (wsUrl) => {
        // Step 1: Set up two network interfaces
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        // Wait for both interfaces to connect
        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);

        console.log("Testing interfaces:", iface1, iface2);
        connect(iface1.ip, iface2.ip);

        // Step 2: Set up listening on the specified IP
        const received = [];
        const listenPromise = new Promise((resolve, reject) => {
            listenOnSocket$(iface1.ip, "specificTestChannel").subscribe(
                (socket) => {
                    console.log("Listening on socket:", socket);
                    socket.on("data", (data) => {
                        console.log("Received data:", data);
                        received.push(data);
                        resolve(); // Resolve when data is received
                    });
                },
                (err) => {
                    console.error("Error in listenOnSocket$:", err);
                    reject(err);
                }
            );
        });

        // Step 3: Send a message to the specified IP
        connectStream$(iface1.ip, "specificTestChannel").subscribe(
            (stream) => {
                console.log("Stream connected, sending message");
                stream.write(b4a.from("test message"));
            },
            (err) => t.fail("Failed to connect stream: " + err.message)
        );

        // Wait for data to be received
        await listenPromise;

        // Step 4: Validate the received message
        t.is(received.length, 1, "Received exactly one message");
        t.alike(received[0], b4a.from("test message"), "Received message matches sent data");
    }, t);
});


test("Reconnection of network interfaces", async (t) => {
    await useWebServer(async (wsUrl) => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        closeInterface(nic1);
        t.ok(true, "Interface 1 closed");

        const reconnectionPromise = new Promise((resolve) => {
            const newNic1 = addWebSocketNetworkInterface(wsUrl);
            networkInterfaceConnected$(newNic1).subscribe(() => resolve(newNic1));
        });

        const newNic1 = await reconnectionPromise;

        t.ok(newNic1, "Interface 1 reconnected successfully");
    }, t);
});
test("Stress test with high data volume", async (t) => {
    t.plan(1);
    await useWebServer(async (wsUrl) => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);

        connect(iface1.ip, iface2.ip);

        const largeMessage = b4a.from("x".repeat(1024 * 1024)); // 1 MB message

        const result = await new Promise(resolve => {
            listenOnSocket$(iface1.ip, "stressTest").subscribe((socket) => {
                console.log(socket.localIp, iface1)
                socket.once("data", data => {
                    socket.once("data", () => t.fail("Only one message expected"));
                    resolve(data);
                });
            });

            connectStream$(iface1.ip, "stressTest").subscribe((stream) => {
                stream.write(largeMessage);
            });
        });

        // await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for transmission
        t.alike(result, largeMessage, "Received correct data");
    }, t);
});

test("Connect with all interfaces", async t => {
    t.plan(1);
    await useWebServer(async (wsUrl) => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);

        connect(iface1.ip, iface2.ip);

        listenOnSocket$("0.0.0.0", "stressTest").pipe(take(1)).subscribe((socket) => {
            console.log(socket.localIp, iface1)
            socket.once("data", data => {
                socket.once("data", () => t.fail("Only one message expected"));
                t.ok(`${data}`, "what are you doing tonight?");
            });
        });

        connectStream$(iface1.ip, "stressTest").subscribe((stream) => {
            stream.write(b4a.from("what are you doing tonight?"));
        });
    }, t);
});

test("Connect with wildcard '0.0.0.0' from localhost", async t => {
    enableLocalHostInterface();
    t.plan(1);
    listenOnSocket$("0.0.0.0", "stressTest").pipe(take(1)).subscribe((socket) => {
        socket.once("data", data => {
            socket.once("data", () => t.fail("Only one message expected"));
            t.ok(`${data}`, "what are you doing tonight?");
        });
    });

    connectStream$("127.0.0.1", "stressTest").pipe(take(1)).subscribe((stream) => {
        stream.write(b4a.from("what are you doing tonight?"));
    });
    t.teardown(() => resetStore());
});

test("Connect with all network interfaces with localhost enabled", async t => {
    enableLocalHostInterface();
    t.plan(1);
    await useWebServer(async (wsUrl) => {
        const nic1 = addWebSocketNetworkInterface(wsUrl);
        const nic2 = addWebSocketNetworkInterface(wsUrl);

        await Promise.all([
            new Promise((resolve) => networkInterfaceConnected$(nic1).subscribe(resolve)),
            new Promise((resolve) => networkInterfaceConnected$(nic2).subscribe(resolve)),
        ]);

        const iface1 = getInterfaceOfId(nic1);
        const iface2 = getInterfaceOfId(nic2);

        connectToAllInterfaces(iface2.ip)

        listenOnSocket$("0.0.0.0", "stressTest").pipe(take(1)).subscribe((socket) => {
            console.log(socket.localIp, iface1)
            socket.once("data", data => {
                socket.once("data", () => t.fail("Only one message expected"));
                t.ok(`${data}`, "what are you doing tonight?");
            });
        });

        connectStream$(iface1.ip, "stressTest").subscribe((stream) => {
            stream.write(b4a.from("what are you doing tonight?"));
        });
    }, t);
});