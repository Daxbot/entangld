# Entangld protocol

> **Draft.** This describes what `lib/` does today, and it's incomplete. Where this document and the code disagree, the
> code wins. The format has no version number yet, and nothing here is a compatibility promise. Open questions are marked
> **TODO**. Changes we're considering are at the [end](#changes-under-consideration).

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

## Changes under consideration

Nothing here is decided or built. A change to the protocol is a good moment to commit to this document, and to make
several of these at once. They're likely worth designing together, because most depend on versioning.

### Versioning

There's no version or capability exchange, so a store can't tell what a peer supports. Almost everything below needs
this first.

Wrinkles:

- **Unknown message types throw.** A new message type raises an error on any store which hasn't upgraded, so we can't
  send one until we know a peer supports it.
- **There's no handshake.** The first message on a link is whatever the application sends, and the library doesn't own
  the transport, so it can't tell when a link comes up. `attach()` is the likely place to start, but it sends nothing
  today, so a peer doesn't know it happened.
- **Mixed versions will be normal.** Separate processes often ship their own copy of the library, so stores on different
  versions must keep working together.

### Tolerating unknown messages

Ignoring unknown types, or reporting them, would make every future change safer to roll out. It would also hide bugs
which throw loudly today.

### Error replies

A `value` can't carry an error, which is why `call_rpc` puts success or failure inside the value. An error reply would
end the hang behind a raw `get`, and would let a store report that it gave up. A raw `get` can't be fixed without this.

Wrinkle: `set_rpc` already has its own error format, so we'd need to decide whether the two merge.

### Cancelling remote work

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
add traffic to what is often a high-rate path, so they should probably be opt-in.

### Smaller improvements

- **Message size:** `value` repeats the `path` the requester already knows, and `set` sends an empty `params`. Both add
  up on high-rate links.
- **`every: null`:** `subscribe` sends this explicitly, where other optional fields are left out.
- **Transport guidance:** a recommended framing and example transport, so that a new port doesn't start from `lib/`.
- **Conformance cases:** a shared set of message examples which any port can run, so that ports notice when they drift.
