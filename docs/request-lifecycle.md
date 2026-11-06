# Request lifecycle: ideas for later

`timeout_ms` and `signal` only change what the caller does. They stop the wait or end the subscription on the calling
store, and nothing about them goes over the wire. That leaves two gaps:

- **Remote work keeps running.** An RPC which timed out or was aborted may still finish, so a retry can run it twice.
- **Middle stores leak.** In a chain A → B → C, if a reply is lost after B, A gives up but B keeps its `_requests` entry
  forever. That's one small entry per lost reply.

The two ideas below would close those gaps. Both change the protocol, so neither is built yet. Nothing needs them today.
Pick them up when something has a real need, like a long-running RPC which should stop when its caller leaves.

## Idea 1: a `cancel` message

When a request is aborted, send a new message down the chain, and let the function at the far end stop its work:

```js
{ type: "cancel", uuid }

store.set("slow.job", async (params, { signal }) => { /* can stop early */ });
```

Each store on the way clears its own pending request, which also fixes the middle store leak when the link still works.

Wrinkles:

- **It's a protocol change, and old peers throw.** `receive()` throws an `EntangldError` on an unknown message type, so
  sending `cancel` to a store which hasn't upgraded raises an error there. We'd need a way to know what a peer supports
  first. There's no capability or version exchange today.
- **Middle stores need a new map.** Each hop creates its own uuid for a `get`, so `cancel` can't simply be forwarded. A
  store has to remember which incoming request (by uuid and sender) became which outgoing request, and clean that up on
  every outcome.
- **Function signatures.** Functions are called as `data(params)`, so a second argument is possible, but any function
  which already has an optional second parameter would start receiving the context by accident. It may need to be
  opt-in. Check `_deref_mode` too, which calls functions without a request.
- **`set_rpc` has no obvious place for it.** It calls `func(...params)`, so every position belongs to the caller's
  arguments. Appending the context would collide with optional parameters, and `set_rpc` prints usage from the function's
  parameters, so those would need filtering. This probably needs an opt-in on `set_rpc` itself.
- **Functions have to cooperate.** A signal only asks a function to stop. One which ignores it keeps running, so a
  timeout still can't promise the work stopped.
- **It can't cross a dead link.** If the link is down, `cancel` is lost just as the reply was. That's what idea 2 is for.

## Idea 2: deadlines which travel

Send the remaining time with the request, and have each hop enforce it:

```js
{ type: "get", path, value, uuid, timeout_ms: 8500 }
```

Each store passes on what's left, so a middle store cleans up by itself even if the link dies. Sending relative time
avoids clock skew between stores. This is how gRPC deadlines work.

Wrinkles:

- **Also a protocol change, but a gentler one.** `receive()` only reads the fields it knows, so an old peer should ignore
  the extra field. It also won't enforce it or pass it on, so coverage stops at the first old store, silently. Confirm
  this before relying on it.
- **A hop can't report that it gave up.** A `value` message has no way to carry an error, so a store which times out can
  only clean up and stay quiet. The caller then gets the timeout from its own timer. That's fine, but it means no store
  can say which hop failed.
- **Should the far end get it?** Passing the deadline to a function is the same signature problem as idea 1.
- **Hops need a little margin.** If every hop uses the same remaining time, they all expire together and race. It may be
  worth subtracting a small allowance per hop.

## Related: errors on raw `get`

A raw `get` can't report a remote function's failure, which is why `set_rpc` and `call_rpc` exist. They carry success or
failure inside the value. If a function behind a raw `get` rejects, no reply is sent at all and the caller hangs, unless
it set a `timeout_ms` or `signal`.

An error reply would fix that, and would let a hop report that it gave up. It's the same kind of protocol change as the
ideas above, so it's worth designing them together.

Worth checking at the same time: `detach()` doesn't touch pending requests, so they stay in `_requests`.
