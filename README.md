# Entangld

[![Tests](https://github.com/Daxbot/entangld/actions/workflows/mocha-tests.yml/badge.svg)](https://github.com/Daxbot/entangld/actions/workflows/mocha-tests.yml)
[![npm](https://img.shields.io/npm/v/entangld)](https://www.npmjs.com/package/entangld)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Synchronized key-value stores with RPCs and pub/sub events, in pure JavaScript with no runtime dependencies.

Entangld links stores together so that each one can read, write, call and watch data in the others, using ordinary
paths. Stores can be in the same process, or spread across a network. It doesn't care how they're connected: you give it
a way to send a message, and it does the rest.

- **One path for everything.** `get("robot.motor.speed")` works the same whether the data is local or several stores away.
- **Functions as values.** Store a function at a path, and reading the path calls it.
- **RPCs.** Call functions in other stores, and get their results and errors back.
- **Subscriptions.** Watch a path or a wildcard in any linked store, with optional throttling.
- **Any transport.** Sockets, IPC, or a function call. [Sockhop](https://www.npmjs.com/package/sockhop) works well.
- **Timeouts and cancellation.** Give up on a request with a timeout or an `AbortSignal`.

## Install

```sh
npm install entangld
```

## Quick start

Link two stores, then use one to reach into the other.

```js
const Entangld = require("entangld");

const parent = new Entangld();
const child = new Entangld();

// Tell each store how to reach the other. Here that's a function call, but it could be a socket
parent.transmit((msg, store) => store.receive(msg, parent));
child.transmit((msg, store) => store.receive(msg, child));

// Make the child visible at a path in the parent
parent.attach("child", child);

child.set("system.voltage", 33);

await parent.get("child.system.voltage"); // 33
```

The examples below use `await`, so they need to run inside an `async` function. Examples which use `parent` and `child`
assume the stores above.

## Examples

### Reading and writing

```js
const store = new Entangld();

store.set("number.six", 6);

await store.get("number.six"); // 6
await store.get("number");     // { six: 6 }

// Write to a linked store with the same path you'd read it with
parent.set("child.system.led", true);
await child.get("system.led"); // true

// Add to an array, keeping the 2 newest entries
child.set("log", []);
parent.push("child.log", "first", 2);
parent.push("child.log", "second", 2);
parent.push("child.log", "third", 2);
await child.get("log"); // [ "second", "third" ]
```

### Functions as values

A function at a path runs when the path is read. It can return a value or a promise, and you can read beneath its result.

```js
child.set("sensor.read", async () => ({ temperature: 21 }));
child.set("math.double", (value) => value * 2);

await parent.get("child.sensor.read");             // { temperature: 21 }
await parent.get("child.sensor.read.temperature"); // 21

// The second argument is passed to the function
await parent.get("child.math.double", 4);          // 8
```

### RPCs

`set_rpc` and `call_rpc` are the better choice for a function which can fail, because errors reach the caller. A plain
function can't report an error to another store, so its caller would never get a reply.

```js
child.set_rpc("math.divide", (a, b) => {
    if (b === 0) throw new Error("Can't divide by zero");
    return a / b;
});

await parent.call_rpc("child.math.divide", [ 10, 2 ]); // 5

try {
    await parent.call_rpc("child.math.divide", [ 10, 0 ]);
} catch (err) {
    console.log(err.message); // Can't divide by zero
}
```

### Subscriptions

Watch a path in any linked store. Paths can use `*` as a wildcard.

```js
const uuid = parent.subscribe("child.motor.speed", (path, value) => {
    console.log(path, value); // child.motor.speed 12
});

child.set("motor.speed", 12);

parent.unsubscribe(uuid);

// Watch everything beneath a path
parent.subscribe("child.sensors.*", (path, value) => {
    console.log(path, value); // child.sensors.left 3
});

child.set("sensors.left", 3);
```

Throttle a busy path, so that the callback only runs for one in every few changes.

```js
let count = 0;
parent.subscribe("child.lidar.range", () => count++, { every: 2 });

for (const range of [ 1, 2, 3, 4 ]) child.set("lidar.range", range);

console.log(count); // 2
```

A store can also see when others subscribe to it, which is useful for only producing data while someone is listening.

```js
child.on("subscription", (path, uuid) => console.log("Watching", path)); // Watching camera.frame

parent.subscribe("child.camera.frame", () => { });
```

### Chains of stores

Stores can be linked in any arrangement. Each one only needs to know its neighbours, and paths pass straight through the
ones in between.

```js
const dashboard = new Entangld();
const robot = new Entangld();
const motor = new Entangld();

const link = (store) => store.transmit((msg, other) => other.receive(msg, store));
[ dashboard, robot, motor ].forEach(link);

dashboard.attach("robot", robot);
robot.attach("motor", motor);

motor.set("speed", 2.5);

await dashboard.get("robot.motor.speed"); // 2.5

dashboard.subscribe("robot.motor.speed", (path, value) => {
    console.log(path, value); // robot.motor.speed 3
});

motor.set("speed", 3);
```

Stores can also be attached deeper than the root, as in `parent.attach("fleet.robots.one", child)`.

### Timeouts

A request waits forever if its reply is lost, for example if a link drops part way through. Set a limit, and it rejects
with an `EntangldTimeoutError` instead. This works on `get` and `call_rpc`.

```js
const { EntangldTimeoutError } = Entangld.error;

child.set("sensor.stuck", () => new Promise(() => { }));

try {
    await parent.get("child.sensor.stuck", undefined, { timeout_ms: 100 });
} catch (err) {
    console.log(err instanceof EntangldTimeoutError); // true
}
```

### Cancelling with signals

An [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) ties a request or a subscription to
anything else, like a job finishing or a link dropping. An aborted request rejects with `signal.reason`, and an aborted
subscription ends.

```js
const controller = new AbortController();
const { signal } = controller;

child.set("job.slow", () => new Promise(() => { }));

const job = parent.get("child.job.slow", undefined, { signal });

parent.subscribe("child.job.progress", (path, value) => {
    console.log("Progress", value); // Progress 50
}, { signal });

child.set("job.progress", 50);

// Ends the request and the subscription together
controller.abort(new Error("No longer needed"));

try {
    await job;
} catch (err) {
    console.log(err.message); // No longer needed
}

child.set("job.progress", 100); // Nobody is told
```

### Over sockets

Each side of a socket gets its own store. The socket stands in for the store on the other side.

```js
const Entangld = require("entangld");
const Sockhop = require("sockhop");

// The server side
const parent = new Entangld();
const server = new Sockhop.server();

parent.transmit((msg, socket) => server.send(socket, msg));

server.on("receive", (data, meta) => parent.receive(data, meta.socket));
server.on("disconnect", (socket) => parent.detach(null, socket));
server.on("connect", async (socket) => {
    parent.attach("client", socket); // With several clients, use a unique name for each one

    console.log(await parent.get("client.my.name")); // Entangld
});

await server.listen();

// The client side
const child = new Entangld();
const client = new Sockhop.client();

child.transmit((msg) => client.send(msg));
client.on("receive", (data) => child.receive(data));

child.set("my.name", "Entangld");

await client.connect();
```

## Good to know

- **Timeouts and aborts only stop the wait.** They don't stop work which has already started in another store, so an RPC
  which timed out may still have run. Take care before retrying one.
- **Choose a signal or `unsubscribe()` for a subscription, not both.** `unsubscribe()` throws if the subscription has
  already ended, including when its signal aborted, even if that was before `subscribe()` was called. If you do mix them,
  check `signal.aborted` first, or catch the error.
- **Unsubscribing by path ends every subscription on that path.** To end one, use the uuid from `subscribe()`. To end
  everything beneath a path, use `unsubscribe_tree()`. The `subscriptions` getter lists what a store has.
- **Attached stores are placeholders in their parent.** Getting a parent path shows an attached store as an empty object.
  Fetching the whole tree would need a request to every store. Query the attached path to see its contents.
- **Functions with parameters should have defaults.** In deref mode, functions are called with no arguments.

## Deref mode

A function normally runs only when its own path is read, so reading its parent doesn't include it. In deref mode, reading
a parent runs the functions beneath it too, and waits for any promises.

```js
const store = new Entangld({ deref_mode: true });

store.set("number.six", 6);
store.set("number.seven", () => 7);

await store.get("number"); // { six: 6, seven: 7 }
```

This has two costs. Results are copied, which is slower, and the copy goes through JSON, so values like a `Map` are lost.
Over a socket that rarely matters, but it can for local stores holding values which aren't plain JSON.

## Documentation

- [API reference](API.md)
- [Protocol](docs/protocol.md), a draft, including changes under consideration

## Known limitations

- `detach()` doesn't end subscriptions from or through that store, and doesn't touch requests waiting on it.
- Querying a parent can't include the contents of attached stores.
- Deref mode turns values into JSON and back, which is inefficient and loses values like `Map`.
- Some unit tests depend on the state left by earlier tests.
- `unsubscribe_tree()` needs a test that it throws when it can't remove every subscription.

## Development

```sh
npm test         # Run the tests
npm run docs     # Regenerate API.md from the source
```

## License

[MIT](LICENSE)
