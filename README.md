# Entangld

Synchronized key-value stores with RPCs and pub/sub events.  Works over sockets (try it with [Sockhop](https://www.npmjs.com/package/sockhop "Sockhop on NPM")!)

## Examples
Basic use:
```js
    const { Datastore } = require("entangld");

    let e=new Datastore();

    // Simple set/get
    e.set("number.six",6);
    e.get("number.six").then((val)=>{});     // val==6

    // Functions as values
    e._deref_mode=true;
    e.set("number.seven",()=>{ return 7;});
    e.get("number").then((val)=>{});         // val => { six:6, seven, 7}

    // Promises from functions
    e.set("number.eight",()=>{ return new Promise((resolve)=>{ resolve(8); }); });
    e.get("number.eight").then((val)=>{});     // val==8

    // Even dereference beneath functions
    e.set("eenie.meenie",()=>{ return {"miney": "moe"}; });
    e.get("eenie.meenie.miney").then((val)=>{});    // val=="moe"
    
```

Pairing two data stores together:
```js
    let parent=new Datastore();
    let child=new Datastore();

    // Attach child namespace
    parent.attach("child",child);

    // Configure communications
    parent.transmit((msg, store) => store.receive(msg,parent)); // store will always be child
    child.transmit((msg, store) => store.receive(msg, child)); // store will always be parent

    // Set something in the child...
    child.set("system.voltage",33);

    // Get it back in the parent
    parent.get("child.system.voltage");        // == 33
```
Using getter functions as RPC:
```js
    // Assign a function to a child key
    child.set("double.me",(param=0)=>param*2);    // Or we could return a Promise instead of a value, if we wanted to!

    // Call the RPC from the parent
    parent.get("child.double.me", 2).then((val)=>{

        // val == 4
    });

```
Note in this example how we set a default value for this getter function (0).  This is because when _deref_mode is ```true``` this getter will be called without any arguments.

Pub/sub (remote events):
```js
    // Assign an event callback
    parent.subscribe("child.system.voltage",(path, val)=>{

        // path=="child.system.voltage"
        // val==21
    });

    // Trigger a callback on the parent
    child.set("system.voltage",21);


    // Listen on the child for when the parent subscribes
    child.on("subscription", ( path, uuid ) => console.log("Parent subscribed to :" + path));
    parent.subscribe("child.system.voltage"); // Child prints: "Parent subscribed to : system.voltage"

    // Throttle the subscription callbacks, so that the callback is only called every 2 sets
    let counter = 0;
    parent.subscribe("child.rapid.data", () => counter += 1, 2);
    child.set("rapid.data", 1) // triggers callback
    child.set("rapid.data", 1) // doesn't trigger callback
    child.set("rapid.data", 1) // triggers callback
    child.set("rapid.data", 1) // doesn't trigger callback
    console.log( counter ); // === 2

```
Over sockets:
```js
    const Sockhop=require("sockhop");
    const Entangld=require("entangld");


    /**
     * Parent / server setup
     */

    let parent=new Datastore();
    let server=new Sockhop.server();

    // Connect server to parent store
    parent.transmit((msg, store)=>server.send(store, msg));
    server
        .on("receive",(data, meta)=>parent.receive(data, meta.sock))        // Use the socket as the data store handle
        .on('connect',(sock)=>{

            parent.attach("client", sock);                    // "client" works for one client.  Normally use uuid() or something

            parent.get("client.my.name")
                .then((val)=>{

                    console.log("Client's name is "+val);
                    server.close();
                });
        })
        .on('disconnect', (sock)=>parent.detach(null, sock))
        .on('error', (e)=>console.log("Sockhop error: "+e))
        .listen();


    /**
     * Child / client setup
     */

    let child=new Datastore();
    let client=new Sockhop.client();

    // Connect client to child store
    child.transmit((msg)=>client.send(msg));
    client
        .on("receive", (data, meta)=>child.receive(data))
        .on("connect", ()=>{
            // attach() to parent is optional, if we plan to get() parent items
        })
        .on("error", (e)=>console.log("Sockhop error: "+e))
        .connect();

    child.set("my.name", "Entangld");
```


## Raison d'etre
Any object can store values.  And a Map can store values keyed to objects.  But what if you want to....

- Have your store synchronized with multiple data sources (other stores)?
- Over a network?
- Subscribe to events within the datastore?

## Notes

- As of version 2.0.0, subscriptions all have uuids (which are the same across a chain of subscription objects, in the case of subscriptions to remote datastores), which supports multiple (remote or local) subscriptions to the same endpoint, but with different callback functions. The uuid of a subscription is available in the subscription object (a list of which is exposed from the datastore via `store.owned_subscriptions()`), and is also returned from the method call `store.subscribe("path.to.data")`. Having access to this uuid also allows the user to cancel specific subscriptions. The method call `store.unsubscribe(...)` will now either accept a path or a uuid. For paths, the method will terminate _all_ subscriptions matching that path, while for uuids, only the specific subscription matching that uuid will be canceled.
- As of version 1.5.0, subscriptions may be created across multiple chained datastores.  Subscription removal now acts on all subscriptions matching (but not beneath) a given path.  To unsubscribe a tree, use ```unsubscribe_tree()```
- As of version 1.2.0, attached datastores may be located at arbitrary paths, not just in the root:
```parent.attach("child.goes.here", child);```
- Also as of 1.2.0, attach()ed child stores will appear in the parent as placeholders (empty objects) when .get() is called on paths within the parent.  For example:
```
child.set("",{"child" : "data" });
parent.set("",{"parent" : "data"});
parent.attach("child", child);

parent.get("");     // Returns { "parent" : "data", "child" : {} }
parent.get("child"); // Returns {"child" : "data"}
```
This is because we would have to perform recursive child queries to show you a complete tree.   This is left for a future version.
- If you ```.set()``` a function, that function may return a value or a Promise.  If it returns a promise, that promise will be returned directly to you when you call ```.get()```
- As of version 1.4.0, you may subscribe() to a local event.  This should probably be eventually replaced with native events.  In other words, instead of ```.subscribe("a.b.c", callback)``` we should use ```.on("path.a.b.c", callback)```

## _deref_mode
If you attach a key to a getter function instead of a value, that function would never be called until you request that key directly (i.e. querying the parent of that key would not reveal that that key exists).  This changed in 1.2.1, when _deref_mode was introduced.  If you set _deref_mode to true, it will iterate all leaves and try to call all functions.  Those that return Promise will have their Promise resolved before the result is actually returned.

This is pretty cool, and after consideration it is probably the way this thing should work all the time.  However it also introduces two problems which are not yet resolved (//TODO):

First, in an effort to not accidentally mutate the original data set, a copy is made.  This is somewhat inefficient.
Second, when the copy is made, JSON.parse/JSON.stringify are used.  This means that leaves consisting of Map() or the like are just erased.

If these two issues can be resolved at some point, _deref_mode will probably be turned on permanently.  Honestly, for remote stores operating over sockets it's probably not a huge issue.  More to the point are local stores where the user might be storing non JSON-compatible items.


## TODO
- Make sure incoming values request store doesn't build up
- When querying a parent, perhaps there should be an option to also dump child stores located below that level (potentially resource intensive)
- Fix _deref_mode so it doesn't "strip" the returned object by turning everything to JSON and back (inefficient and it's basically mutating the result silently)
- Fix unit tests so they are completely independent (tests often depend on prior test ending with a particular state)
- Detaching a store does not unsubscribe to any subscriptions from or through that store and may therefore leave things in a dirty or unstable state.  We could unsubscribe_tree(store_name) but that would not take care of passthrough subscriptions (those that don't belong to us)
- unsubscribe_tree() needs to have a test ensuring errors are thrown if not all subs can be removed

## License
MIT
