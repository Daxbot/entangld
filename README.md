# Entangld

Synchronized key-value stores with RPCs and events.  Works over sockets (try it with [Sockhop](https://www.npmjs.com/package/sockhop "Sockhop on NPM")!)

## Examples
Basic use, pairing two data stores together:
```js
	var parent=new Entangld();
	var child=new Entangld();

	// Attach child namespace
	s.attach("child",child);

	// Configure communications
	parent.transmit((msg, store)=>store.receive(msg));	// store === child in this example
	child.transmit((msg)=>parent.receive(msg, child));

	// Set something in the child...
	child.set("system.voltage",33);

	// Get it back in the parent
	parent.get("child.system.voltage");		// == 33
```
RPC mode:
```js
	// Assign a function to a child key
	child.set("double.me",(param)=>param*2);

	// Call the RPC from the parent
	parent.get("child.double.me", 2).then((val)=>{

		// val == 4
	});

```
Over sockets:
```js
var Sockhop=require("sockhop");
var Entangld=require("entangld");
var parent=new Entangld();


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
    * [.set(path, the)](#Entangld+set)
    * [.get(path, [params])](#Entangld+get) ⇒ <code>object</code>
    * [.subscribe(path, f)](#Entangld+subscribe)

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

<a name="Entangld+set"></a>

### entangld.set(path, the)
Set an object into the store

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Throws**:

- <code>Error</code> Throws error on empty path


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to set (like "system.fan.voltage") |
| the | <code>object</code> | object you want to set it to |

<a name="Entangld+get"></a>

### entangld.get(path, [params]) ⇒ <code>object</code>
Get an object from the store

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Returns**: <code>object</code> - the object living at that path  
**Throws**:

- <code>Errror</code> throws error on empty path


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to query (like "system.voltage") |
| [params] | <code>object</code> | the parameters to be passed to the remote function (RPC mode only) |

<a name="Entangld+subscribe"></a>

### entangld.subscribe(path, f)
Subscribe to change events for a path

If objects at or below this path change, you will get a callback

**Kind**: instance method of <code>[Entangld](#Entangld)</code>  
**Throws**:

- <code>Error</code> error thrown on empty path


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to watch |
| f | <code>function</code> | the callback - will be of the form (path, value) |


### TODO
- Make sure incoming values request store doesn't build up 


## License
MIT

