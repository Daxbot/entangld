# Entangld protocol

> **Draft.** This describes what `lib/` does today, and it's incomplete. Where this document and the code disagree, the
> code wins. The format has no version number yet, and nothing here is a compatibility promise. Open questions are marked
> **TODO**. The [preferred direction](#proposed-handshakes-and-versioning) and other
> [changes we're considering](#changes-under-consideration) are at the end.

## Overview

Stores talk to each other by passing messages. A store knows only its immediate neighbours, so a path which crosses
several stores is handled one link at a time.

On any link, the store which attached the other is **upstream**, and the attached store is **downstream**. `get`, `set`,
`push`, `subscribe` and `unsubscribe` messages travel downstream. `value` and `event` messages travel upstream.

The library doesn't provide a transport. `transmit()` supplies the function which sends a message, and `receive()` takes
the messages which arrive.

**TODO:** state what a transport must guarantee. Today, a lost `value` leaves a request waiting unless the caller set a
limit, and nothing says whether messages must arrive in order.

## Messages

Messages are objects with these fields. A field which is `undefined` is left out when the message is serialized as JSON.

| Field | Used by | Meaning |
| --- | --- | --- |
| `type` | All | One of the types below |
| `path` | All but `unsubscribe` | A path relative to the downstream store |
| `value` | `get`, `value`, `set`, `push`, `event` | The payload |
| `uuid` | `get`, `value`, `subscribe`, `event`, `unsubscribe` | Links messages together, see [uuids](#uuids) |
| `params` | `set`, `push` | Options. `limit` is the maximum length of the array after a `push` |
| `every` | `subscribe` | Send one event per this many changes. `null` means every change |

### `get`

Reads a path or calls a function. `value` is the optional parameter: the argument for a function, or a maximum depth for
data. It's left out if there is none.

```json
{ "type": "get", "path": "system.voltage", "uuid": "fe9921dd-a48a-4fac-9f4e-2fa882b2948d" }
{ "type": "get", "path": "double.me", "value": [ 4 ], "uuid": "1023077d-683f-4ff1-8900-bb01b298e0ca" }
```

### `value`

Answers a `get`, with the same `path` and `uuid`. A path with no data has no `value` field.

```json
{ "type": "value", "path": "system.voltage", "value": 12, "uuid": "fe9921dd-a48a-4fac-9f4e-2fa882b2948d" }
```

RPCs use this message too. `set_rpc` wraps a function so that its reply is `[ true, result ]`, or `[ false, error ]` if
it failed. `call_rpc` unwraps that, so to the protocol an RPC is an ordinary `get`.

### `set` and `push`

Write to a path. There is no reply. A `set` with no `value` removes the path. A `push` adds to an array, and fails on the
receiving store if the path isn't one.

```json
{ "type": "set", "path": "system.voltage", "value": 2, "params": {} }
{ "type": "push", "path": "log", "value": 1, "params": { "limit": 5 } }
```

### `subscribe`

Asks to be told about changes to a path. There is no reply. The path may use `*` as a wildcard.

```json
{ "type": "subscribe", "path": "system.*", "uuid": "e6c079db-a6d6-4b5b-9baa-b6bb4f8f3a49", "every": 2 }
```

### `event`

Reports a change for a subscription. `path` is the path which changed, relative to the sender. The receiver adds its
namespace for that link. `every` is applied by the store which owns the data, so skipped changes never cross a link.

```json
{ "type": "event", "path": "system.voltage", "value": 12, "uuid": "e6c079db-a6d6-4b5b-9baa-b6bb4f8f3a49" }
```

### `unsubscribe`

Ends a subscription. It has no `path`. A store also sends one in reply to an `event` which matches none of its
subscriptions.

```json
{ "type": "unsubscribe", "uuid": "e6c079db-a6d6-4b5b-9baa-b6bb4f8f3a49" }
```

## Behaviours

### uuids

- **`get` and `value`:** a uuid belongs to one link. A store forwarding a `get` makes a new one, so a chain of three
  stores uses two uuids for one request.
- **Subscriptions:** one uuid is used along the whole chain, by `subscribe`, `event` and `unsubscribe`.

### Chains

A store forwarding a request holds its own pending entry, and answers upstream when its downstream answers.
Subscriptions are daisy-chained in the same way. A store in the middle holds a `pass through` subscription, which only
sends events upstream.

### Reattaching

`attach()` removes any subscriptions beneath the new namespace and subscribes them again, using the same uuids. A store
replaces an existing subscription which has the same uuid and path, so that a client which reconnects doesn't get
duplicate events.

### Failures

- **Nothing reports an error across a link.** There is no error message.
- **Functions:** if a function behind a `get` fails, no `value` is sent. Functions which can fail should use `set_rpc`.
- **Unknown message types:** `receive()` throws an `EntangldError`.
- **Late replies:** a `value` with an unknown uuid is ignored, because the request may have timed out.
- **Failed writes:** if a `set` or `push` fails, the error stays on the receiving store. The sender isn't told.

### What stays local

`timeout_ms` and `signal` never appear in a message. They stop the wait or end the subscription on the calling store,
and aborting a subscription sends an ordinary `unsubscribe`.

**TODO:** cover `attach`, `detach`, and what happens to pending requests when a link drops. `detach()` leaves them in
`_requests` today.

## Proposed: handshakes and versioning

**Not built or adopted.** This is the preferred direction, not a description of what the library does.

Today a store can't tell what a peer supports, and a new message type raises an error on any store which hasn't upgraded.
This proposal lets stores find out, and sets rules so that later changes need as few stores upgraded as possible.

### Negotiating a link

The application calls `negotiate()` when a link comes up, because only it knows when that happens. `attach()` can't do
this: some stores call it once at startup before any socket connects, and others call it per connection.

```js
// A client which reconnects by itself
this.cortex.on("connect", () => {
    this.datastore.negotiate(this.cortex, { timeout_ms: 5000 });
});

// A server, with a new socket per connection
_serverOnConnect(socket) {
    this.datastore.attach(`chips.${id}`, socket);
    this.datastore.negotiate(socket, { timeout_ms: 5000 });
}
```

Asking lazily, on first need, was rejected. `set` and `subscribe` are synchronous so they can't wait for an answer, and a
lost reply would stall every caller waiting on it. It would also still need a hook, to forget a peer on disconnect.

Negotiation is per link, because messages already work hop by hop. It's an ordinary `get` of `@entangld.protocol` on the
peer, and the answer is a protocol number and a list of features, both separate from the npm version:

```json
{ "protocol": 1, "features": [ "cancel", "error_reply" ] }
```

- **Old stores:** a `get` of an unknown path returns `undefined` on 2.6.0, with no error, so an old store can be asked
  safely. No new message type is needed.
- **Unknown means old:** a link counts as protocol 0 until it has an answer. A lost reply leaves it there, so nothing
  new is sent to a store which may not understand it.
- **Reconnects:** a peer can change across a reconnect, so `negotiate()` runs on every connect. A stale answer's worst
  case should be an ignored message, once unknown messages are ignored.

### Features upgrade existing calls

Applications don't check feature lists or build messages. Once a link is negotiated, the library takes over. **A feature
upgrades an existing call, and never needs its own code path**, so the same code works on old and new links.

| Application code | With an old peer | With a peer which has the feature |
| --- | --- | --- |
| `controller.abort()` | Stops waiting | Also cancels the remote work |
| `{ timeout_ms: 5000 }` | Local timer | Also sends the deadline along the chain |
| `subscribe(path, callback)` | Today's events | Compact events |
| `get` on a function which fails | Waits for its limit | Rejects with the real error |
| `get(path, undefined, { strict: true })` | Behaves as `get` does today | Rejects if the path isn't found |

For the times an application wants to know, there's one checker. It takes a path, so the caller doesn't need to know
which link that means:

```js
store.supports("b.slow_job", "cancel");
```

It can only answer for the immediate neighbour, so `true` doesn't promise that a store further along the chain has the
feature. Avoid methods per feature, like `can_cancel()`.

### Reserved names

Any path segment starting with `@` is reserved, at any level. New stores refuse to `set` or `attach` these names, so they
never appear in the data, in `get("")`, or in wildcards. `$` was rejected because shells expand it, so
`--get bots.x.$entangld.protocol` silently loses the name.

Only one reserved namespace is used to start, `@entangld`, at the root of a store:

```js
store.get("b.@entangld.protocol");
```

Suffixes like `a.b.c.@schema` are reserved but not used. Asked this on 2.6.0, a store runs any function at `a.b.c`, fails
navigating the result, and never replies. Negotiation doesn't make that safe, because it only describes the neighbour,
and a path may be owned several stores away. They could become a shorthand once old stores are gone.

### Queries

A root query has to reach the store which owns a path, and callers usually don't know where one store ends and the next
begins. So the library does it, and each store peels off one hop:

```js
store.describe("b.c.motor.start");
```

```json
{ "type": "get", "path": "@entangld.describe", "value": { "path": "c.motor.start" }, "uuid": "..." }
```

B sees that `c` is an attached store, and forwards the query to C with `motor.start`. An old store in the middle answers
`undefined`, so the query stops there, safely. This first upgrade needs every store on the way to be new. The rules below
are there so that later ones don't.

**A query a store understands never answers `undefined`.** That leaves `undefined` to mean only that a store on the way
doesn't support the query, so a caller can tell the two apart.

`describe` looks at a path without calling it:

```js
await store.describe("b.c.motor.start");

// { exists: true, kind: "rpc" }
// { exists: false }
// { exists: null, kind: "function" }     Beneath a function, so it can't tell without calling it
```

`store.exists(path)` is a thin wrapper around this, for the common case. It returns `null` when it can't tell, including
for a store which doesn't support the query.

### Strict reads

`get` returns `undefined` for a missing path, a removed path, and a function which returned `undefined`, and the replies
are identical. A `value` reply gains a field saying whether the path was found:

```json
{ "type": "value", "path": "nope", "found": false, "uuid": "..." }
```

```js
await store.get("b.nope");                                  // undefined, as it is today
await store.get("b.nope", undefined, { strict: true });     // Rejects with an EntangldNotFoundError
await store.get("b.empty_fn", undefined, { strict: true }); // undefined, because it was found
```

This takes one round trip and can't go stale, unlike calling `exists` before `get`, so `exists` is for asking about a
path and `strict` is for reading one. An old store sends no `found`, so `strict` can't tell, and behaves as `get` does
today.

Wrinkle: a store forwarding a `get` rebuilds the reply from the value alone, because `_requests` only passes on
`msg.value`, so `found` would be lost at each hop. Stores need to carry the whole reply, which is also what keeping
unrecognised fields needs.

`subscribe` doesn't take `strict`. Subscribing to a path before it exists is normal, and a subscription whose path
appears later still works. It's also synchronous with no reply, so it has nothing to reject. To check first, call
`describe`. Knowing that a subscription arrived is a different question, see
[acknowledgements](#acknowledgements).

### Forward compatibility

**Only the stores which care about a change should need upgrading.** This release has to touch every store, so it should
make that the last time where it can. Each store follows these rules from protocol 1 on:

- **Route without interpreting.** A store forwards an `@entangld` query by its `path`, whether or not it recognises the
  name. Only the store which answers needs to understand it.
- **Don't answer what you don't know.** The store which owns the path answers `undefined` for an unknown name. Queries
  it does know never answer `undefined`, so a caller can tell that it isn't supported.
- **Keep what you don't recognise.** A store forwarding a message or a reply passes on fields it doesn't know.
  `receive()` drops them today, by calling `get(msg.path, msg.value)`, and `_requests` only passes on `msg.value`.
- **Ignore unknown message types.** `receive()` throws today. Ignoring them makes a stale negotiation harmless, at the
  cost of hiding bugs which are loud today, so it may be worth emitting an event.
- **Degrade, don't fail.** A feature a store lacks should make a call weaker, not break it.

For example, a later `who_owns` query, where a store says whether it owns an endpoint or only passes it through, would
need only the answering store to upgrade. Every store between would forward it without knowing what it means.

**The limit:** this covers anything a store only needs to pass along. A feature which needs a store to act still needs
that store upgraded. Cancelling and deadlines have to clear each store's pending request, and compact events change the
encoding of one link, so those stop at the first old store, or only apply where both ends support them.

**TODO:** decide what the protocol number means once features exist. It may only need to change for a breaking change.

## Changes under consideration

Nothing here is decided or built. A change to the protocol is a good moment to commit to this document, and to make
several of these at once. Most depend on the [proposal above](#proposed-handshakes-and-versioning).

### Error replies

A `value` can't carry an error, which is why `call_rpc` puts success or failure inside the value. An error reply would
end the hang behind a raw `get`, and would let a store report that it gave up. A raw `get` can't be fixed without this.

Wrinkle: `set_rpc` already has its own error format, so we'd need to decide whether the two merge.

### Cancelling remote work

Applications would use this through `abort()`, not a new method, as [proposed](#features-upgrade-existing-calls).

Today an RPC which timed out or was aborted may still finish, so a retry can run it twice. A new message could carry the
abort down the chain, and let the function at the far end stop:

```js
{ type: "cancel", uuid }

store.set("slow.job", async (params, { signal }) => { /* can stop early */ });
```

Each store on the way clears its pending request, which fixes the leak described under deadlines when the link works.

Wrinkles:

- **Middle stores need a new map.** A `get` has a different uuid on each link, so `cancel` can't simply be forwarded. A
  store has to remember which incoming request (by uuid and sender) became which outgoing request, and clean that up on
  every outcome.
- **Function signatures.** Functions are called as `data(params)`, so a second argument is possible, but any function
  which already has an optional second parameter would start receiving the context by accident. It may need to be
  opt-in. `_deref_mode` also calls functions, with no request at all.
- **`set_rpc` has no obvious place for it.** It calls `func(...params)`, so every position belongs to the caller's
  arguments. Appending the context would collide with optional parameters, and `set_rpc` prints usage from the
  function's parameters, so those would need filtering. This probably needs an opt-in on `set_rpc` itself.
- **Functions have to cooperate.** A signal only asks a function to stop. One which ignores it keeps running, so a
  timeout still can't promise the work stopped.
- **It can't cross a dead link.** If the link is down, `cancel` is lost just as the reply was.

### Deadlines which travel

In a chain A → B → C, if a reply is lost after B, A gives up but B keeps its pending entry forever. Sending the remaining
time with the request would let each store enforce it, even if the link dies. Relative time avoids clock skew between
stores. This is how gRPC deadlines work.

```js
{ type: "get", path, value, uuid, timeout_ms: 8500 }
```

Wrinkles:

- **Coverage stops at old stores, silently.** `receive()` only reads the fields it knows, so an old peer should ignore
  the extra field, but it won't enforce it or pass it on. Confirm this before relying on it.
- **A store can't report that it gave up,** without error replies. It can only clean up and stay quiet, and the caller
  gets the timeout from its own timer.
- **Should the far end get it?** Passing the deadline to a function is the same signature problem as cancelling.
- **Stores need a little margin.** If every store uses the same remaining time, they all expire together and race. It
  may be worth subtracting a small allowance per link.

### Acknowledgements

`set`, `push` and `subscribe` have no reply, so a lost message goes unnoticed. A lost `subscribe` is the worst case,
because the events simply never arrive. Acks would need an answer for what to do when one doesn't come, and they would
add traffic to what is often a high-rate path, so they should probably be opt-in. For `subscribe`, this is a better fit
than a strict mode, because what a caller wants to know is that the subscription arrived, not that the path exists yet.

### Compact events

An event for one number is 115 bytes of JSON, most of it the `path` and `uuid`. A short subscription id agreed for each
link gets that to 15 bytes, as `[ 3, 12, 1.234567 ]`, with no schema. On a link which sends one path about ten times a
second, that's a real saving. It only needs both ends of a link to support it.

### Schemas

`set_rpc` already returns usage text, which is a small version of this. A store could describe its endpoints, so a caller
knows what to expect. Schemas should be optional descriptions, never enforced, because a store accepts any JSON and a
schema can drift from what's really there.

Packing messages from a schema isn't worth it. On the example above, binary with a schema gets to 11 bytes against 15 for
compact events, and adds the risk of two ends disagreeing about a schema.

### Smaller improvements

- **`value` size:** `value` repeats the `path` the requester already knows, and `set` sends an empty `params`.
- **`every: null`:** `subscribe` sends this explicitly, where other optional fields are left out.
- **Transport guidance:** a recommended framing and example transport, so that a new port doesn't start from `lib/`.
- **Conformance cases:** a shared set of message examples which any port can run, so that ports notice when they drift.
