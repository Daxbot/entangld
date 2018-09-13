# Entangld

Synchronized key-value stores with RPCs and pub/sub events.  Works over sockets (try it with [Sockhop](https://www.npmjs.com/package/sockhop "Sockhop on NPM")!)

## Examples
Basic use:
```js
	let e=new Entangld();

	// Simple set/get
	e.set("number.six",6);
	e.get("number.six").then((val)=>{}); 	// val==6

	// Functions as values
	e._deref_mode=true;
	e.set("number.seven",()=>{ return 7;});
	e.get("number").then((val)=>{}); 		// val => { six:6, seven, 7}

	// Promises from functions
	e.set("number.eight",()=>{ return new Promise((resolve)=>{ resolve(8); }); });
	e.get("number.eight").then((val)=>{}); 	// val==8

	// Even dereference beneath functions
	e.set("eenie.meenie",()=>{ return {"miney": "moe"}; });
	e.get("eenie.meenie.miney").then((val)=>{});	// val=="moe"

```

Pairing two data stores together:
```js
	let parent=new Entangld();
	let child=new Entangld();

	// Attach child namespace
	parent.attach("child",child);

	// Configure communications
	parent.transmit((msg, store)=>store.receive(msg));	// store === child in this example
	child.transmit((msg)=>parent.receive(msg, child));

	// Set something in the child...
	child.set("system.voltage",33);

	// Get it back in the parent
	parent.get("child.system.voltage");		// == 33
```
Using getter functions as RPC:
```js
	// Assign a function to a child key
	child.set("double.me",(param=0)=>param*2);	// Or we could return a Promise instead of a value, if we wanted to!

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

	// Trigger an event
	child.set("system.voltage",21);
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
	.on("receive",(data, meta)=>parent.receive(data, meta.sock))		// Use the socket as the data store handle
	.on('connect',(sock)=>{

		parent.attach("client", sock);					// "client" works for one client.  Normally use uuid() or something

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

- As of version 1.5.0, subscriptions may be created across multiple chained datastores.  Subscription removal now acts on all subscriptions matching (but not beneath) a given path.  To unsubscribe a tree, use ```unsubscribe_tree()```
- As of version 1.2.0, attached datastores may be located at arbitrary paths, not just in the root: 
```parent.attach("child.goes.here", child);```
- Also as of 1.2.0, attach()ed child stores will appear in the parent as placeholders (empty objects) when .get() is called on paths within the parent.  For example:
```
child.set("",{"child" : "data" });
parent.set("",{"parent" : "data"});
parent.attach("child", child);

parent.get(""); 	// Returns { "parent" : "data", "child" : {} }
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
<dd><p>Message class for Entangld</p>
</dd>
<dt><a href="#Entangld">Entangld</a> ⇐ <code>EventEmitter</code></dt>
<dd><p>Synchronized Event Store</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#dereferenced_copy">dereferenced_copy(o)</a> ⇒ <code>Promise</code></dt>
<dd><p>Deep copy an object</p>
<p>Uses JSON parse methods so things that don&#39;t work in JSON will disappear, with the special exception of functions which<br>are replaced by their return values (or if the function returns a promise, the value that it resolves to).</p>
<p>If you pass undefined, it will return a promise resolving to undefined.</p>
</dd>
</dl>

<a name="Entangld_Message"></a>

## Entangld_Message
Message class for Entangld

**Kind**: global class  
<a name="Entangld"></a>

## Entangld ⇐ <code>EventEmitter</code>
Synchronized Event Store

**Kind**: global class  
**Extends:** <code>EventEmitter</code>  

* [Entangld](#Entangld) ⇐ <code>EventEmitter</code>
    * [.namespaces](#Entangld+namespaces) ⇒ <code>array</code>
    * [.namespace()](#Entangld+namespace) ⇒ <code>string</code>
    * [.attach(namespace, store)](#Entangld+attach)
    * [.detach([namespace], [store])](#Entangld+detach)
    * [.transmit(f)](#Entangld+transmit)
    * [.receive(msg, [store])](#Entangld+receive)
    * [.push(path, object)](#Entangld+push)
    * [.set(path, object, [operation_type])](#Entangld+set)
    * [.get(path, [params|max_depth])](#Entangld+get) ⇒ <code>Promise</code>
    * [.subscribe(path, f)](#Entangld+subscribe) ⇒ <code>Promise</code>
    * [.subscribed_to(subscription)](#Entangld+subscribed_to) ⇒ <code>boolean</code>
    * [.unsubscribe(path)](#Entangld+unsubscribe) ⇒ <code>number</code>
    * [.unsubscribe_tree()](#Entangld+unsubscribe_tree)

<a name="Entangld+namespaces"></a>

### entangld.namespaces ⇒ <code>array</code>
Get namespaces

**Kind**: instance property of <code>[Entangld](#Entangld)</code>  
**Returns**: <code>array</code> - namespaces an array of attached namespaces  
**Read only**: true  
<a name="Entangld+namespace"></a>

### entangld.namespace() ⇒ <code>string</code>
Get namespace for a store

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Returns**: <code>string</code> - namespace for the given store  
**Read only**: true  
<a name="Entangld+attach"></a>

### entangld.attach(namespace, store)
Attach a namespace and a store

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Throws**:

- <code>Error</code> Error will be thrown if you try to attach a namespace twice


| Param | Type | Description |
| --- | --- | --- |
| namespace | <code>string</code> | a namespace for this store |
| store | <code>object</code> | an object that will be sent along with "transmit" callbacks when we need something from this store |

<a name="Entangld+detach"></a>

### entangld.detach([namespace], [store])
Detach a namespace / store pair

If you only pass a namespace or a store, it will find the missing item before detaching

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Throws**:

- <code>Error</code> Error will be thrown if you don't pass at least one parameter


| Param | Type | Description |
| --- | --- | --- |
| [namespace] | <code>string</code> | the namespace |
| [store] | <code>object</code> | the store |

<a name="Entangld+transmit"></a>

### entangld.transmit(f)
Transmit 

Specify a callback to be used so we can transmit data to another store
Callback will be passed (msg, store) where msg is an object and store is the Entangld store that should receive() it

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  

| Param | Type | Description |
| --- | --- | --- |
| f | <code>function</code> | the callback function |

<a name="Entangld+receive"></a>

### entangld.receive(msg, [store])
Receive

Call this function with the data that was sent via the transmit() callback

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  

| Param | Type | Description |
| --- | --- | --- |
| msg | <code>object</code> | the message that was given to the callback |
| [store] | <code>object</code> | the Entangld store that sent the message |

<a name="Entangld+push"></a>

### entangld.push(path, object)
Push an object into an array in the store

Convenience method for set(path, o, "push")

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Throws**:

- <code>Error</code> 


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to set (like "system.fan.voltage") |
| object | <code>object</code> | the object or function you want to store at that path |

<a name="Entangld+set"></a>

### entangld.set(path, object, [operation_type])
Set an object into the store

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Throws**:

- <code>Error</code> 


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| path | <code>string</code> |  | the path to set (like "system.fan.voltage") |
| object | <code>object</code> |  | the object or function you want to store at that path |
| [operation_type] | <code>string</code> | <code>&quot;\&quot;set\&quot;&quot;</code> | whether to set or push the new data (push only works if the data item exists and is an array) |

<a name="Entangld+get"></a>

### entangld.get(path, [params|max_depth]) ⇒ <code>Promise</code>
Get an object from the store

Note: using max_depth, especially large max_depth, involves a lot of recursion and may be expensive

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Returns**: <code>Promise</code> - promise resolving to the object living at that path  
**Throws**:

- <code>Errror</code> throws error


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to query (like "system.voltage") |
| [params|max_depth] |  | the parameters to be passed to the remote function (RPC) or the maximum depth of the returned object (normal mode) |

<a name="Entangld+subscribe"></a>

### entangld.subscribe(path, f) ⇒ <code>Promise</code>
Subscribe to change events for a path

If objects at or below this path change, you will get a callback

Subscriptions to keys within attach()ed stores are remote subscriptions.  If several stores are attached in some kind of 
arrangement, a given key may actually traverse multiple stores!  Since each store only knows its immediate neighbors - and
has no introspection into those neigbors - each store is only able to keeps track of the neighbor on each side with
respect to a particular path and has no knowledge of the eventual endpoints.  

For example, let's suppose capital letters represent Entangld stores and lowercase letters are actual
objects.  Then  the path "A.B.c.d.E.F.g.h" will represent a subscription that traverses four Entangld stores.  From the point of 
view of a store in the middle - say, E - the "upstream" is B and the "downstream" is F.

Each store involved keeps track of any subscriptions with which it is involved.  It tracks the upstream and downstream, and 
the uuid of the subscription.  The uuid is the same across all stores for a given subscription.  For a particular store, the 
upstream is null if it is the original link in the chain, and the downstream is null if this store owns the endpoint value.

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Returns**: <code>Promise</code> - promise resolving to the subscription UUID  
**Throws**:

- <code>Error</code> error thrown on empty path


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to watch |
| f | <code>function</code> | the callback - will be of the form (path, value) |

<a name="Entangld+subscribed_to"></a>

### entangld.subscribed_to(subscription) ⇒ <code>boolean</code>
Check for subscription

Are we subscribed to a particular remote path?

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  

| Param | Type | Description |
| --- | --- | --- |
| subscription | <code>string</code> | the subscription to check for |

<a name="Entangld+unsubscribe"></a>

### entangld.unsubscribe(path) ⇒ <code>number</code>
Unubscribe to change events for a given path

Caution - all events belonging to you with the given path will be deleted

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Returns**: <code>number</code> - number of subscriptions removed  
**Throws**:

- <code>Error</code> 


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to unwatch |

<a name="Entangld+unsubscribe_tree"></a>

### entangld.unsubscribe_tree()
Unsubscribe tree

Remove any subscriptions that are beneath a path

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Throws**:

- <code>Error</code> error if there are stores we cannot detach (i.e. they belong to someone else / upstream != null)

<a name="dereferenced_copy"></a>

## dereferenced_copy(o) ⇒ <code>Promise</code>
Deep copy an object

Uses JSON parse methods so things that don't work in JSON will disappear, with the special exception of functions which  
are replaced by their return values (or if the function returns a promise, the value that it resolves to).

If you pass undefined, it will return a promise resolving to undefined.

**Kind**: global function  
**Returns**: <code>Promise</code> - result a promise resolving to a completely new, de-referenced object only containing objects and values  

| Param | Type | Description |
| --- | --- | --- |
| o | <code>object</code> | the object to copy. |


## TODO
- Make sure incoming values request store doesn't build up 
- When querying a parent, perhaps there should be an option to also dump child stores located below that level (potentially resource intensive)
- Fix _deref_mode so it doesn't "strip" the returned object by turning everything to JSON and back (inefficient and it's basically mutating the result silently)
- Fix unit tests so they are completely independent (tests often depend on prior test ending with a particular state)
- Detaching a store does not unsubscribe to any subscriptions from or through that store and may therefore leave things in a dirty or unstable state.  We could unsubscribe_tree(store_name) but that would not take care of passthrough subscriptions (those that don't belong to us)
- unsubscribe_tree() needs to have a test ensuring errors are thrown if not all subs can be removed
- Entangld_Message does not have a .payload member or some such, just a .path.  Yet for some subscribe related tasks we need to pass a payload, do we end up with a clumsy .path.path (vs .data.path or .payload.path)

## License
MIT

