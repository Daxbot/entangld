# Entangld

Synchronized key-value stores with RPCs and pub/sub events.  Works over sockets (try it with [Sockhop](https://www.npmjs.com/package/sockhop "Sockhop on NPM")!)

## Examples
Basic use:
```js
    let e=new Entangld();

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
    let parent=new Entangld();
    let child=new Entangld();

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

    let parent=new Entangld();
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

    let child=new Entangld();
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

## Classes

<dl>
<dt><a href="#Entangld_Message">Entangld_Message</a></dt>
<dd><p>Message class for Entangld.</p>
<p>These messages are used for executing datastore operations between
remote datastores. In these relationships, there is always an upstream
and downstream pair, so that <code>get</code>, <code>set</code>, <code>push</code> and <code>subscribe</code> messages
are created upstream and passed downstream while <code>event</code> and <code>value</code> messages
are created downstream and are passed back up. <code>unsubscribe</code> events can travel
in both directions. To maintain consistency, the internal <code>.path</code> attribute
will always refer a path relative to the downstream datastore, since the
downstream datastores do not necessarilly have access to the upstream store
structure, and so cannot generally construct upstream paths. This means that
the <code>.path</code> attribute is a <code>tree</code> relative to the upstream datastore, and
the upstream path can be reconstructed as:</p>
<pre><code class="language-javascript"> &gt; upstream._namespaces.get(downstream) + &quot;.&quot; + msg.path;</code></pre>
<p>Since <code>unsubscribe</code> messages can pass either upstream or downstream, the notion
of a path is ill-defined, and so unsubscribe messages should have their <code>.path</code>
attributes set to undefined or null.</p>
<p>Most messages will also have a <code>.uuid</code> attribute. For <code>get</code>/<code>value</code> messages,
this allows for the value to be properly linked back up with the original <code>get</code>
message. For the <code>subscribe</code>/<code>unsubscribe</code>/<code>event</code> messages, this allows for
callback functions to be trigger properly, and for unsubscribe messages to
propogate both directions. <code>set</code>/<code>push</code> messages do not use the <code>.uuid</code> attribute
since they require no response.</p>
</dd>
<dt><a href="#EntangldError">EntangldError</a></dt>
<dd><p>Error class for Entangld.</p>
</dd>
<dt><a href="#Subscription">Subscription</a></dt>
<dd><p>A datastore subscription object</p>
</dd>
<dt><a href="#Entangld">Entangld</a> ⇐ <code>EventEmitter</code></dt>
<dd><p>Synchronized Event Store</p>
</dd>
</dl>

<a name="Entangld_Message"></a>

## Entangld\_Message
Message class for Entangld.

These messages are used for executing datastore operations between
remote datastores. In these relationships, there is always an upstream
and downstream pair, so that `get`, `set`, `push` and `subscribe` messages
are created upstream and passed downstream while `event` and `value` messages
are created downstream and are passed back up. `unsubscribe` events can travel
in both directions. To maintain consistency, the internal `.path` attribute
will always refer a path relative to the downstream datastore, since the
downstream datastores do not necessarilly have access to the upstream store
structure, and so cannot generally construct upstream paths. This means that
the `.path` attribute is a `tree` relative to the upstream datastore, and
the upstream path can be reconstructed as:
```javascript
 > upstream._namespaces.get(downstream) + "." + msg.path;
```
Since `unsubscribe` messages can pass either upstream or downstream, the notion
of a path is ill-defined, and so unsubscribe messages should have their `.path`
attributes set to undefined or null.

Most messages will also have a `.uuid` attribute. For `get`/`value` messages,
this allows for the value to be properly linked back up with the original `get`
message. For the `subscribe`/`unsubscribe`/`event` messages, this allows for
callback functions to be trigger properly, and for unsubscribe messages to
propogate both directions. `set`/`push` messages do not use the `.uuid` attribute
since they require no response.

**Kind**: global class  

* [Entangld_Message](#Entangld_Message)
    * [.get(tree, [get_params])](#Entangld_Message.get) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
    * [.value(get_msg, value)](#Entangld_Message.value) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
    * [.setpush(obj)](#Entangld_Message.setpush) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
    * [.subscribe(tree, uuid)](#Entangld_Message.subscribe) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
    * [.event(path, value, uuid)](#Entangld_Message.event) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
    * [.unsubscribe(uuid)](#Entangld_Message.unsubscribe)

<a name="Entangld_Message.get"></a>

### Entangld_Message.get(tree, [get_params]) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
Create a `get` message for remote datastores

**Kind**: static method of [<code>Entangld\_Message</code>](#Entangld_Message)  
**Returns**: [<code>Entangld\_Message</code>](#Entangld_Message) - - The get message to pass to the remote datastore  

| Param | Type | Description |
| --- | --- | --- |
| tree | <code>string</code> | the path relative to the remote datastore |
| [get_params] | <code>\*</code> | any parameters to be passed to the                                        remote datastore's local get function |

<a name="Entangld_Message.value"></a>

### Entangld_Message.value(get_msg, value) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
Create a `value` message in response to a `get` message

**Kind**: static method of [<code>Entangld\_Message</code>](#Entangld_Message)  
**Returns**: [<code>Entangld\_Message</code>](#Entangld_Message) - - The `value` message to pass back  

| Param | Type | Description |
| --- | --- | --- |
| get_msg | [<code>Entangld\_Message</code>](#Entangld_Message) | the `get` message which this is in response to |
| value |  | the value of the `get` |

<a name="Entangld_Message.setpush"></a>

### Entangld_Message.setpush(obj) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
Create a `set`/`push` message for a remote datastore

**Kind**: static method of [<code>Entangld\_Message</code>](#Entangld_Message)  
**Returns**: [<code>Entangld\_Message</code>](#Entangld_Message) - - the "set" or "push" message  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | The parameter object for the set/push |
| obj.type | <code>string</code> | either "set" or "push" |
| obj.tree | <code>string</code> | the path (relative to the downstream datastore) |
| obj.value | <code>\*</code> | the value to insert into the datastore |
| obj.params | <code>\*</code> | any additional parameters |

<a name="Entangld_Message.subscribe"></a>

### Entangld_Message.subscribe(tree, uuid) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
Construct subscribe message

**Kind**: static method of [<code>Entangld\_Message</code>](#Entangld_Message)  
**Returns**: [<code>Entangld\_Message</code>](#Entangld_Message) - the `subscribe` message  

| Param | Type | Description |
| --- | --- | --- |
| tree | <code>string</code> | the path (relative to the downstream datastore) |
| uuid | <code>Uuid</code> | the subscription uuid |

<a name="Entangld_Message.event"></a>

### Entangld_Message.event(path, value, uuid) ⇒ [<code>Entangld\_Message</code>](#Entangld_Message)
Create an `event` message to return data to subscribe callbacks

**Kind**: static method of [<code>Entangld\_Message</code>](#Entangld_Message)  
**Returns**: [<code>Entangld\_Message</code>](#Entangld_Message) - the `event` message  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path (relative to the downstream store) |
| value | <code>\*</code> | the updated datastore value at the path |
| uuid | <code>Uuid</code> | the uuid of the subscribe being triggered |

<a name="Entangld_Message.unsubscribe"></a>

### Entangld_Message.unsubscribe(uuid)
Create an unsubscribe message for a subscription uuid

**Kind**: static method of [<code>Entangld\_Message</code>](#Entangld_Message)  

| Param | Type | Description |
| --- | --- | --- |
| uuid | <code>String</code> | the subscription uuid |

<a name="EntangldError"></a>

## EntangldError
Error class for Entangld.

**Kind**: global class  
<a name="Subscription"></a>

## Subscription
A datastore subscription object

**Kind**: global class  

* [Subscription](#Subscription)
    * [new Subscription(obj)](#new_Subscription_new)
    * [.is_pass_through](#Subscription+is_pass_through) ⇒ <code>Boolean</code>
    * [.is_terminal](#Subscription+is_terminal) ⇒ <code>Boolean</code>
    * [.is_head](#Subscription+is_head) ⇒ <code>Boolean</code>
    * [.has_downstream](#Subscription+has_downstream) ⇒ <code>Boolean</code>
    * [.has_upstream](#Subscription+has_upstream) ⇒ <code>Boolean</code>
    * [.call()](#Subscription+call)
    * [.matches_message(msg)](#Subscription+matches_message) ⇒ <code>Boolean</code>
    * [.matches_path(path)](#Subscription+matches_path) ⇒ <code>Boolean</code>
    * [.matches_uuid(uuid)](#Subscription+matches_uuid) ⇒ <code>Boolean</code>
    * [.is_beneath(path)](#Subscription+is_beneath) ⇒ <code>Boolean</code>
    * [.is_above(path)](#Subscription+is_above) ⇒ <code>Boolean</code>
    * [.static_copy()](#Subscription+static_copy) ⇒ [<code>Subscription</code>](#Subscription)

<a name="new_Subscription_new"></a>

### new Subscription(obj)
Constructor

**Returns**: [<code>Subscription</code>](#Subscription) - - the subscription object  

| Param | Type | Description |
| --- | --- | --- |
| obj | <code>Object</code> | the configuration object |
| obj.path | <code>string</code> | the datastore path (relative to this datastore)                             of the subscription |
| obj.uuid | <code>Uuid</code> | the uuid of the subscription chain |
| obj.callback | <code>function</code> | the callback function, with signature (path, value),                               where path is relative to this datastore |
| obj.downstream | [<code>Entangld</code>](#Entangld) \| <code>null</code> | the downstream datastore (if any)                                          associated with this subscription |
| obj.upstream | [<code>Entangld</code>](#Entangld) \| <code>null</code> | the upstream datastore (if any)                                          associated with this subscription |
| obj.every | <code>number</code> \| <code>null</code> | how many `set` messages to wait before calling callback |

<a name="Subscription+is_pass_through"></a>

### subscription.is\_pass\_through ⇒ <code>Boolean</code>
Check if subscription is a `pass through` type

Pass throughs are as the links in a chain of subscriptions to allows
subscriptions to remote datastores. One store acts as the `head`, where
the callback function is registered, an all others are `path through` datastores
which simply pass event messages back up to the head subscription.

**Kind**: instance property of [<code>Subscription</code>](#Subscription)  
<a name="Subscription+is_terminal"></a>

### subscription.is\_terminal ⇒ <code>Boolean</code>
Check if this subscription will be directly given data by a datastore

**Kind**: instance property of [<code>Subscription</code>](#Subscription)  
<a name="Subscription+is_head"></a>

### subscription.is\_head ⇒ <code>Boolean</code>
Check if this subscription will apply a user-supplied callback to data

**Kind**: instance property of [<code>Subscription</code>](#Subscription)  
<a name="Subscription+has_downstream"></a>

### subscription.has\_downstream ⇒ <code>Boolean</code>
Check if subscription has any downstream subscriptions

It the subscription refers to a remote datastore (the downstream), this
getter will return a true. Note that !this.has_downstream will check if
the subscription is the `tail` subscription object in a subscription chain.

**Kind**: instance property of [<code>Subscription</code>](#Subscription)  
<a name="Subscription+has_upstream"></a>

### subscription.has\_upstream ⇒ <code>Boolean</code>
Check if subscription has any upstream subscriptions

It the subscription passes data back to a remote datastore (the upstream), this
getter will return a true.

**Kind**: instance property of [<code>Subscription</code>](#Subscription)  
<a name="Subscription+call"></a>

### subscription.call()
Apply this callback function

Note, this method also tracks the number of times that a callback
function is called (if this subscription is terminal), so that if
the subscriptions are throttled by specifying an `this.every`,
this method will only call the callback function every `this.every`
times it receives a `set` message. If this subscription is not
terminal, then the callback function is called every time.

This method also is safed when a callback function is not give (i.e.
by the `this.static_copy()` method).

**Kind**: instance method of [<code>Subscription</code>](#Subscription)  
<a name="Subscription+matches_message"></a>

### subscription.matches\_message(msg) ⇒ <code>Boolean</code>
Check if an `event`/`unsubscribe` message matches this subscription

**Kind**: instance method of [<code>Subscription</code>](#Subscription)  
**Returns**: <code>Boolean</code> - - True if the message is associated with the subscription  

| Param | Type | Description |
| --- | --- | --- |
| msg | [<code>Entangld\_Message</code>](#Entangld_Message) | a received message from a downstream datastore |

<a name="Subscription+matches_path"></a>

### subscription.matches\_path(path) ⇒ <code>Boolean</code>
Check if a provided path matches this path

**Kind**: instance method of [<code>Subscription</code>](#Subscription)  
**Returns**: <code>Boolean</code> - - true if the path matches  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>String</code> | a path string to check against |

<a name="Subscription+matches_uuid"></a>

### subscription.matches\_uuid(uuid) ⇒ <code>Boolean</code>
Check if a provided uuid matches this uuid

**Kind**: instance method of [<code>Subscription</code>](#Subscription)  
**Returns**: <code>Boolean</code> - - true if the path matches  

| Param | Type | Description |
| --- | --- | --- |
| uuid | <code>Uuid</code> | a uuid string to check against |

<a name="Subscription+is_beneath"></a>

### subscription.is\_beneath(path) ⇒ <code>Boolean</code>
Check if subscription path is beneath a provided path

**Kind**: instance method of [<code>Subscription</code>](#Subscription)  
**Returns**: <code>Boolean</code> - - true if the subscription is beneath the path  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>String</code> | a path string to check against |

<a name="Subscription+is_above"></a>

### subscription.is\_above(path) ⇒ <code>Boolean</code>
Check if subscription path is above a provided path

**Kind**: instance method of [<code>Subscription</code>](#Subscription)  
**Returns**: <code>Boolean</code> - - true if the subscription is beneath the path  

| Param | Type | Description |
| --- | --- | --- |
| path | <code>String</code> | a path string to check against |

<a name="Subscription+static_copy"></a>

### subscription.static\_copy() ⇒ [<code>Subscription</code>](#Subscription)
Get a copy of this subscription without external references

This creates a copy, except the upstream/downstream references
are set to true (if they exist) or null (if they don't. Addtionally,
the callback function is excluded.

**Kind**: instance method of [<code>Subscription</code>](#Subscription)  
**Returns**: [<code>Subscription</code>](#Subscription) - a copy of this subscription object  
<a name="Entangld"></a>

## Entangld ⇐ <code>EventEmitter</code>
Synchronized Event Store

**Kind**: global class  
**Extends**: <code>EventEmitter</code>  

* [Entangld](#Entangld) ⇐ <code>EventEmitter</code>
    * [.namespaces](#Entangld+namespaces) ⇒ <code>array</code>
    * [.subscriptions](#Entangld+subscriptions) ⇒ [<code>Array.&lt;Subscription&gt;</code>](#Subscription)
    * [.namespace()](#Entangld+namespace) ⇒ <code>string</code>
    * [.attach(namespace, obj)](#Entangld+attach)
    * [.detach([namespace], [obj])](#Entangld+detach) ⇒ <code>boolean</code>
    * [.transmit(func)](#Entangld+transmit)
    * [.receive(msg, obj)](#Entangld+receive)
    * [.push(path, data, [limit])](#Entangld+push)
    * [.set(path, data, [operation_type], [params])](#Entangld+set)
    * [.get(path, [params])](#Entangld+get) ⇒ <code>Promise</code>
    * [.subscribe(path, func, [every])](#Entangld+subscribe) ⇒ <code>Uuid</code>
    * [.subscribed_to(subscription)](#Entangld+subscribed_to) ⇒ <code>Boolean</code>
    * [.unsubscribe(path_or_uuid)](#Entangld+unsubscribe) ⇒ <code>number</code>
    * [.unsubscribe_tree(path)](#Entangld+unsubscribe_tree)

<a name="Entangld+namespaces"></a>

### entangld.namespaces ⇒ <code>array</code>
Get namespaces

**Kind**: instance property of [<code>Entangld</code>](#Entangld)  
**Returns**: <code>array</code> - namespaces - an array of attached namespaces  
**Read only**: true  
<a name="Entangld+subscriptions"></a>

### entangld.subscriptions ⇒ [<code>Array.&lt;Subscription&gt;</code>](#Subscription)
Get list of subscriptions associated with this object

Note, this will include `head`, `terminal` and `pass through` subscriptions,
which can be checked using getter methods of the subscription object.

**Kind**: instance property of [<code>Entangld</code>](#Entangld)  
**Returns**: [<code>Array.&lt;Subscription&gt;</code>](#Subscription) - array of Subscriptions associated with this object  
**Read only**: true  
<a name="Entangld+namespace"></a>

### entangld.namespace() ⇒ <code>string</code>
Get namespace for a store

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Returns**: <code>string</code> - namespace for the given store  
**Read only**: true  
<a name="Entangld+attach"></a>

### entangld.attach(namespace, obj)
Attach a namespace and a store

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Throws**:

- <code>TypeError</code> if namespace/obj is null or empty.
- [<code>EntangldError</code>](#EntangldError) if you try to attach to the same namespace twice.


| Param | Type | Description |
| --- | --- | --- |
| namespace | <code>string</code> | a namespace for this store. |
| obj | <code>object</code> | an object that will be sent along with "transmit" callbacks when we need something from this store. |

<a name="Entangld+detach"></a>

### entangld.detach([namespace], [obj]) ⇒ <code>boolean</code>
Detach a namespace / obj pair.

If you only pass a namespace or a store, it will find the missing item
before detaching.

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Returns**: <code>boolean</code> - true if the element existed and was removed.  
**Throws**:

- [<code>EntangldError</code>](#EntangldError) Error will be thrown if you don't pass at least
one parameter.


| Param | Type | Description |
| --- | --- | --- |
| [namespace] | <code>string</code> | the namespace. |
| [obj] | <code>object</code> | the store object. |

<a name="Entangld+transmit"></a>

### entangld.transmit(func)
Transmit

Specify a callback to be used so we can transmit data to another store.
Callback will be passed (message, obj) where 'message' is an
Entangld_Message object and obj is the object provided by attach().

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Throws**:

- <code>TypeError</code> if func is not a function.


| Param | Type | Description |
| --- | --- | --- |
| func | <code>function</code> | the callback function. |

<a name="Entangld+receive"></a>

### entangld.receive(msg, obj)
Receive

Call this function with the data that was sent via the transmit()
callback.

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Throws**:

- <code>ReferenceError</code> if event object was not provided.
- [<code>EntangldError</code>](#EntangldError) if an unknown message type was received.


| Param | Type | Description |
| --- | --- | --- |
| msg | [<code>Entangld\_Message</code>](#Entangld_Message) | the message to process. |
| obj | <code>object</code> | the attach() object where the message originted. |

<a name="Entangld+push"></a>

### entangld.push(path, data, [limit])
Push an object into an array in the store.

Convenience method for set(path, o, "push").

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Throws**:

- <code>TypeError</code> if path is not a string.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| path | <code>string</code> |  | the path to set (like "system.fan.voltage"). |
| data | <code>object</code> |  | the object or function you want to store at path. |
| [limit] | <code>number</code> | <code></code> | maximum size of the array. Older entries will be removed until the array size is less than or equal to limit. |

<a name="Entangld+set"></a>

### entangld.set(path, data, [operation_type], [params])
Set an object into the store

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Throws**:

- <code>TypeError</code> if path is not a string.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| path | <code>string</code> |  | the path to set (like "system.fan.voltage"). |
| data | <code>object</code> |  | the object or function you want to store at path. |
| [operation_type] | <code>string</code> | <code>&quot;\&quot;set\&quot;&quot;</code> | whether to set or push the new data (push only works if the data item exists and is an array). |
| [params] | <code>object</code> |  | additional parameters. |

<a name="Entangld+get"></a>

### entangld.get(path, [params]) ⇒ <code>Promise</code>
Get an object from the store.

Note: using max_depth, especially large max_depth, involves a lot of
recursion and may be expensive.

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Returns**: <code>Promise</code> - promise resolving to the object at that path.  
**Throws**:

- <code>TypeError</code> if path is not a string.


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to query (like "system.voltage"). |
| [params] | <code>object</code> | the parameters to be passed to the remote function (RPC) or the maximum depth of the returned object (normal mode). |

<a name="Entangld+subscribe"></a>

### entangld.subscribe(path, func, [every]) ⇒ <code>Uuid</code>
Subscribe to change events for a path

If objects at or below this path change, you will get a callback

Subscriptions to keys within attach()ed stores are remote subscriptions.
If several stores are attached in some kind of arrangement, a given key
may actually traverse multiple stores!  Since each store only knows its
immediate neighbors - and has no introspection into those neighbors - each
store is only able to keeps track of the neighbor on each side with
respect to a particular path and has no knowledge of the eventual
endpoints.  This means that subscribing across several datstores is accomplished
by daisy-chaining 2-way subscriptions across each datastore interface.

For example, let's suppose capital letters represent Entangld stores and
lowercase letters are actual objects.  Then  the path "A.B.c.d.E.F.g.h"
will represent a subscription that traverses four Entangld stores.
From the point of view of a store in the middle - say, E - the "upstream"
is B and the "downstream" is F.

Each store involved keeps track of any subscriptions with which it is
involved.  It tracks the upstream and downstream, and the uuid of the
subscription.  The uuid is the same across all stores for a given
subscription.  For a particular store, the upstream is null if it is the
original link in the chain (called the `head`), and the downstream is
null if this store owns the endpoint value (called the `tail`). Any
subscription which is not the head of a chain is called a `pass through`
subscription, because it exist only to pass `event` messages back up the
chain to the head (where the user-provided callback function exists).
subscriptions can be checked to see if they are `pass through` type via
the getter `sub.is_pass_through`.

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Returns**: <code>Uuid</code> - - the uuid of the subscription  
**Throws**:

- <code>TypeError</code> if path is not a string.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| path | <code>string</code> |  | the path to watch. |
| func | <code>function</code> |  | the callback - will be of the form (path, value). |
| [every] | <code>number</code> \| <code>null</code> | <code></code> | the number of `set` messages to wait before calling callback |

<a name="Entangld+subscribed_to"></a>

### entangld.subscribed\_to(subscription) ⇒ <code>Boolean</code>
Check for subscription

Are we subscribed to a particular remote path?

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Returns**: <code>Boolean</code> - true if we are subscribed.  

| Param | Type | Description |
| --- | --- | --- |
| subscription | <code>String</code> | the subscription to check for. |

<a name="Entangld+unsubscribe"></a>

### entangld.unsubscribe(path_or_uuid) ⇒ <code>number</code>
Unubscribe to change events for a given path or uuid.

Caution - if a path is provided, _all_ events belonging to you with that
path will be deleted, so if you have multiple subscriptions on a single path,
and only want one of them to be removed, you must provide the uuid instead.

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Returns**: <code>number</code> - count of subscriptions removed.  
**Throws**:

- [<code>EntangldError</code>](#EntangldError) if no subscriptions were found.


| Param | Type | Description |
| --- | --- | --- |
| path_or_uuid | <code>String</code> \| <code>Uuid</code> | the path (or uuid) to unwatch. |

<a name="Entangld+unsubscribe_tree"></a>

### entangld.unsubscribe\_tree(path)
Unsubscribe tree.

Remove any subscriptions that are beneath a path.

**Kind**: instance method of [<code>Entangld</code>](#Entangld)  
**Throws**:

- [<code>EntangldError</code>](#EntangldError) error if there are stores we cannot detach
(i.e. they belong to someone else / upstream != null)


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the tree to unwatch. |


## TODO
- Make sure incoming values request store doesn't build up
- When querying a parent, perhaps there should be an option to also dump child stores located below that level (potentially resource intensive)
- Fix _deref_mode so it doesn't "strip" the returned object by turning everything to JSON and back (inefficient and it's basically mutating the result silently)
- Fix unit tests so they are completely independent (tests often depend on prior test ending with a particular state)
- Detaching a store does not unsubscribe to any subscriptions from or through that store and may therefore leave things in a dirty or unstable state.  We could unsubscribe_tree(store_name) but that would not take care of passthrough subscriptions (those that don't belong to us)
- unsubscribe_tree() needs to have a test ensuring errors are thrown if not all subs can be removed

## License
MIT
