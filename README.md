# Synchronized Entity Store (SES)

object-safe, easily synchronizable entity store with request events.  Works over sockets (try it with [Sockhop](https://www.npmjs.com/package/sockhop "Sockhop on NPM")!)

## Example
```js
	var parent=new Ses();
	var child=new Ses();

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

## Raison d'etre
Any object can store values.  And a Map can store values keyed to objects.  But what if you want to....

- Have your store synchronized with multiple data sources (other stores)?
- Over a network?
- Subscribe to events within the datastore?

<a name="Ses"></a>

## Ses ⇐ <code>EventEmitter</code>
Synchronized Event Store

**Kind**: global class  
**Extends:** <code>EventEmitter</code>  

* [Ses](#Ses) ⇐ <code>EventEmitter</code>
    * [.namespaces](#Ses+namespaces) ⇒ <code>array</code>
    * [.namespace()](#Ses+namespace) ⇒ <code>string</code>
    * [.attach(namespace, store)](#Ses+attach)
    * [.detach([namespace], [store])](#Ses+detach)
    * [.transmit(f)](#Ses+transmit)
    * [.receive(msg, [store])](#Ses+receive)
    * [.set(path, the)](#Ses+set)
    * [.get(path)](#Ses+get) ⇒ <code>object</code>
    * [.subscribe(path, f)](#Ses+subscribe)

<a name="Ses+namespaces"></a>

### ses.namespaces ⇒ <code>array</code>
Get namespaces

**Kind**: instance property of <code>[Ses](#Ses)</code>  
**Returns**: <code>array</code> - namespaces an array of attached namespaces  
**Read only**: true  
<a name="Ses+namespace"></a>

### ses.namespace() ⇒ <code>string</code>
Get namespace for a store

**Kind**: instance method of <code>[Ses](#Ses)</code>  
**Returns**: <code>string</code> - namespace for the given store  
**Read only**: true  
<a name="Ses+attach"></a>

### ses.attach(namespace, store)
Attach a namespace and a store

**Kind**: instance method of <code>[Ses](#Ses)</code>  
**Throws**:

- <code>Error</code> Error will be thrown if you try to attach a namespace twice


| Param | Type | Description |
| --- | --- | --- |
| namespace | <code>string</code> | a namespace for this store |
| store | <code>object</code> | an object that will be sent along with "transmit" callbacks when we need something from this store |

<a name="Ses+detach"></a>

### ses.detach([namespace], [store])
Detach a namespace / store pair

If you only pass a namespace or a store, it will find the missing item before detaching

**Kind**: instance method of <code>[Ses](#Ses)</code>  
**Throws**:

- <code>Error</code> Error will be thrown if you don't pass at least one parameter


| Param | Type | Description |
| --- | --- | --- |
| [namespace] | <code>string</code> | the namespace |
| [store] | <code>object</code> | the store |

<a name="Ses+transmit"></a>

### ses.transmit(f)
Transmit 

Specify a callback to be used so we can transmit data to another store
Callback will be passed (msg, store) where msg is an object and store is the Ses store that should receive() it

**Kind**: instance method of <code>[Ses](#Ses)</code>  

| Param | Type | Description |
| --- | --- | --- |
| f | <code>function</code> | the callback function |

<a name="Ses+receive"></a>

### ses.receive(msg, [store])
Receive

Call this function with the data that was sent via the transmit() callback

**Kind**: instance method of <code>[Ses](#Ses)</code>  

| Param | Type | Description |
| --- | --- | --- |
| msg | <code>object</code> | the message that was given to the callback |
| [store] | <code>object</code> | the Ses store that sent the message |

<a name="Ses+set"></a>

### ses.set(path, the)
Set an object into the store

**Kind**: instance method of <code>[Ses](#Ses)</code>  
**Throws**:

- <code>Error</code> Throws error on empty path


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to set (like "system.fan.voltage") |
| the | <code>object</code> | object you want to set it to |

<a name="Ses+get"></a>

### ses.get(path) ⇒ <code>object</code>
Get an object from the store

**Kind**: instance method of <code>[Ses](#Ses)</code>  
**Returns**: <code>object</code> - the object living at that path  
**Throws**:

- <code>Errror</code> throws error on empty path


| Param | Type | Description |
| --- | --- | --- |
| path | <code>string</code> | the path to query (like "system.voltage") |

<a name="Ses+subscribe"></a>

### ses.subscribe(path, f)
Subscribe to change events for a path

If objects at or below this path change, you will get a callback

**Kind**: instance method of <code>[Ses](#Ses)</code>  
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

