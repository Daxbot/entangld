var Uuid=require("uuid");

/**
 * Message class for Entangld
 *
 */
class Entangld_Message {

    constructor(type, path, value, uuid) {

        this.type=type;
        this.path=path;
        this.value=value;
        this.uuid=uuid||((type=="get")?Uuid():"");
    }
}

/**
 * Synchronized Event Store
 * @extends EventEmitter
 */
class Entangld {

    constructor(){

        this._stores=new Map();
        this._namespaces=new Map();

        this._transmit=()=>{};
        this._local_data={};
        this._requests={};
        this._subscriptions=[] ;

        // These are recursive hence global but need to be accessible for testing 
        this._partial_copy=partial_copy;
        this._dereferenced_copy=dereferenced_copy;

        // If this is turned on, when someone .get()s an object we will query its children to see if they are functions.
        // We will then call those functions and return their values.  This should be the default behavior, but it is rather expensive.  TODO
        this._deref_mode=false;
    }

    /**
     * Get namespaces
     *
     * @readonly
     * @return {array} namespaces an array of attached namespaces
     */
    get namespaces() {

        return Array.from(this._stores.keys());
    }

    /**
     * Get namespace for a store
     *
     * @readonly
     * @return {string} namespace for the given store
     */
    namespace(store) {

        // return this._namespaces(store);
        return this._namespaces.get(store);
    }

    /**
     * Attach a namespace and a store
     *
     * @param {string} namespace a namespace for this store
     * @param {object} store an object that will be sent along with "transmit" callbacks when we need something from this store
     * @throws {Error} Error will be thrown if you try to attach a namespace twice
     */
    attach(namespace, store){

        // Sanity checks
        if(!store) throw new Error("You cannot attach() a null or empty store");
        if(!namespace) throw new Error("You cannot attach() a null or empty namespace");
        if(this._stores.has(namespace)) throw new Error("You already attach()ed that namespace");

        // Attach the store and namespace
        this._stores.set(namespace,store);
        this._namespaces.set(store, namespace);

        // Create an empty local node so that this attach point is visible
        this._set_local(namespace,{});
    }

    /**
     * Detach a namespace / store pair
     *
     * If you only pass a namespace or a store, it will find the missing item before detaching
     * @param {string} [namespace] the namespace 
     * @param {object} [store] the store
     * @throws {Error} Error will be thrown if you don't pass at least one parameter
     */
    detach(namespace, store){

        if(!namespace && !store) throw new Error("You must specify at least one store or namespace when calling detach()");

        if(!store) store=this._stores.get(namespace);
        if(!namespace) namespace=this._namespaces.get(store);

        // Detach this namespace placeholder from the local store
        this._set_local(namespace,undefined);

        return (this._stores.delete(namespace) && this._namespaces.delete(store));
    }

    /**
     * Transmit 
     *
     * Specify a callback to be used so we can transmit data to another store
     * Callback will be passed (msg, store) where msg is an object and store is the Entangld store that should receive() it
     * @param {function} f the callback function
     */
    transmit(f) {

        this._transmit=f;
    }

    /**
     * Receive
     * 
     * Call this function with the data that was sent via the transmit() callback
     *
     * @param {object} msg the message that was given to the callback
     * @param {object} [store] the Entangld store that sent the message
     */
    receive(msg, store) {

        // Remote "set" request
        if(msg.type=="set") {

            this.set(msg.path, msg.value);

        // Remote "get" request
        } else if(msg.type=="get") {

            this.get(msg.path, msg.value).then((val)=>{

                this._transmit(new Entangld_Message("value", msg.path, val, msg.uuid), store);
            });

        // Incoming value reply
        } else if (msg.type=="value") {

            let resolve=this._requests[msg.uuid];
            resolve(msg.value);

        // Incoming event 
        } else if (msg.type=="event") {

            if(typeof(store)=="undefined") throw new Error("Entangld receive() called without a store");

            // From our perspective, the path is now prepended with the store name
            let path=this._namespaces.get(store)+"."+msg.path;

            // Find and dispatch any subscriptions
            var count=0;            
            for(let s of this._subscriptions){

                if (this._is_beneath(path, s.path)){

                    // Call the callback
                    s.callback(path, msg.value);
                    count++;
                }
            }

            // No one is listening.  This may happen if an event triggers while we are still unsubscribing.
            if(count===0) {

                // Reply with unsubscribe request
                let m=new Entangld_Message("unsubscribe", msg.path);
                this._transmit(m, store);  
            }

        // Incoming remote subscription request
        } else if(msg.type=="subscribe"){

            this._subscriptions.push({path: msg.path, callback: (path, val)=>{

                // This is a remote subscription, so when we are called we need to send the value
                this._transmit(new Entangld_Message("event", path, val));
            }});            

        // Incoming remote subscription request
        } else if(msg.type=="unsubscribe"){

            if(msg.path===""){

                // Unsubscribe from all
                this._subscriptions=[];
            } else {

                // Unsubscribe from one or more
                this._subscriptions=this._subscriptions.filter((s)=>!this._is_beneath(msg.path, s.path));
            }


        // Default
        } else {

            throw new Error ("Received unknown message: "+JSON.stringify(msg));
        }
    }

    /**
     * Set an object into the store
     *
     * @param {string} path the path to set (like "system.fan.voltage")
     * @param {object} object the object or function you want to store at that path
     * @throws {Error} 
     */
    set(path, o) {

        // Sanity check
        if(typeof(path) !="string") throw new Error("path must be a string");

        let [store, , tree]=this._get_remote_store(path);

        // Set local or remote item
        if(store===undefined) {


            // Is this going to mess with an attached store?
            for (let [namespace] of this._stores) {

                if(this._is_beneath(namespace, path)) {

                    throw new Error(`Cannot set ${path} - doing so would overwrite remote store attached at ${path}.  Please detach ${path} first`);
                }
            }

            this._set_local(path,o);

            // Check subscriptions to see if we need to run an event
            for(let s of this._subscriptions){

                if (this._is_beneath(path, s.path)){

                    s.callback(path, o);
                }
            }

        } else {
         
            this._transmit(new Entangld_Message("set", tree, o), store);
        }

    }


    /**
     * Get the remote store in a path
     * 
     * If path contains a remote store, return it as well as the relative path to the remote store
     *
     * Example: let A,B be stores. If A.attach("some.path.to.B", B) 
     * then _get_remote_store("some.path.to.B.data") will return [B, "some.path.to.B", "data"]
     * and _get_remote_store("nonexistent.path") will return [undefined, undefined, path]
     *
     * @private
     * @param {string} path the path to investigate
     * @return {array} array whose elements are [store, store name, relative path below store].  If no store is found, return value is [undefined, undefined, path].
     */
    _get_remote_store(path) {

        // We don't know what part of path might be a store key.  So we need to get all store keys and search (vs .get)
        for (let [namespace, store] of this._stores) {

            if(path.startsWith(namespace)){

                // Exact match means path is the root of the attached store
                if(path.length == namespace.length) {

                    return [store, namespace, ""];
                }

                // Path is longer than namespace. Make sure we matched up to a period
                if(path.substr(namespace.length,1)==".") {

                    return [store, namespace, path.substr(namespace.length+1)];
                }
            }
        }

        // Default: we did not find a store
        return [undefined, undefined, path];
    }

    /**
     * Get an object from the store
     *
     * Note: using max_depth, especially large max_depth, involves a lot of recursion and may be expensive
     *
     * @param {string} path the path to query (like "system.voltage")
     * @param [params|max_depth] the parameters to be passed to the remote function (RPC) or the maximum depth of the returned object (normal mode)
     * @throws {Errror} throws error 
     * @return {Promise} promise resolving to the object living at that path
     */ 
    get(path, params) {

        // Sanity check
        if(typeof(path) !="string") throw new Error("path must be a string");

        // If an attach()ed store path masks (matches but is shorter than) the path, we are returning that store
        let [store, , tree]=this._get_remote_store(path);

        // If store is undefined, we are getting a local item
        if(store===undefined) {

            // Get a reference to the object
            let o=this._get_local(path);

            // If it is a function, call it and return the result
            if(typeof(o)=="function"){

                // Call the function
                let result=o(params);

                // If the function itself returns a promise, return that promise directly
                if(result && result.constructor && result.constructor.name && result.constructor.name=="Promise"){

                    return result;
                } else {

                    // Otherwise, return a fulfilled promise with the result value
                    return new Promise((res)=>res(result));                
                }
            }

            // If params is a number, use it as a max depth and return a Promise resolving to a dereferenced partial copy
            if(typeof(params)=="number"){

                if(this._deref_mode){
                    
                    return dereferenced_copy(partial_copy(o, params));
                } else {

                    return new Promise((res)=>res(partial_copy(o,params)));
                }
            }

            // Default: return a promise resolving to the entire object as-is
            if(this._deref_mode){

                return dereferenced_copy(o);
    
            } else {

               return new Promise((res)=>res(o));
            }
        }

        // Request the data from the remote store
        var msg=new Entangld_Message("get", tree, params);
        var _this=this;
        return new Promise((res)=>{

            _this._requests[msg.uuid]=res;
            this._transmit(msg, store);            
        });

    }

    /**
     * Subscribe to change events for a path
     *
     * If objects at or below this path change, you will get a callback
     * @param {string} path the path to watch
     * @param {function} f the callback - will be of the form (path, value)
     * @throws {Error} error thrown on empty path
     */
    subscribe(path, f) {


        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        let [store, store_name, tree]=this._get_remote_store(path);

        // Undefined store means we are trying to subscribe to something 
        if(store===undefined) throw new Error("Unable to subscribe to nonexistent store (please attach '"+store_name+"' first)");

        // Add to our subscriptions list
        this._subscriptions.push({path: path, callback: f});

        // Tell the store that we are subscribing
        var msg=new Entangld_Message("subscribe", tree);
        this._transmit(msg, store);            

    }

    /**
     * Check for subscription
     *
     * Are we subscribed to a particular remote path?
     *
     * @param {string} subscription the subscription to check for
     * @return {boolean}
     */
     subscribed_to(path){

        for(let s of this._subscriptions){

            if(path==s.path) return true;
        }

        return false;
     }

    /**
     * Unubscribe to change events for a remote path
     *
     * Note that this will unsubscribe from all paths that might cause events to fire for it
     * (all paths above). For example, unsubscribe("a.cars.red.doors") will remove previous
     * subscriptions to "a.cars.red" and "a.cars".
     * 
     * @param {string} path the path to watch
     * @throws {Error}
     */
    unsubscribe(path) {


        let [store, store_name, tree]=this._get_remote_store(path);

        if(store===undefined) throw new Error("Unable to unsubscribe to nonexistent store (please attach '"+store_name+"' first)");

        if(tree.length===0){

            // Unsubscribe from all
            this._subscriptions=this._subscriptions.filter((s)=>!(s.path==store_name || s.path.startsWith(store_name+".")));
    
        } else {

            // Unsubscribe from one or more
            this._subscriptions=this._subscriptions.filter((s)=>!this._is_beneath(path, s.path));
        }


        // Tell the store that we are unsubscribing
        var msg=new Entangld_Message("unsubscribe", tree);
        this._transmit(msg, store);            
    }


    /**
     * Set local object
     *
     * Sets object into local data store. 
     *
     * @private
     * @param {string} path the path at which to store the object
     * @param {object} object the object to store.  If undefined, it unsets that path
     */
    _set_local(path, o){

        // Empty path means set everything
        if(path==="") {

            // Sanity check
            if(typeof(o)!="object" && typeof(o)!="undefined") throw new Error("You are trying to set the root store to something ("+typeof(o)+") besides an object!");

            this._local_data=(typeof(o)=="undefined")?{}:o;
            return;
        }

        let elements=path.split(".");
        let last=elements.pop();
        let pointer=this._local_data;

        for(let el of elements){

            if(!pointer[el]) pointer[el]={};
            pointer=pointer[el];
        }

        if(typeof(o)=="undefined"){

            delete (pointer[last]);

        } else {

            pointer[last]=o;
        }
    }

    /**
     * Get local object
     *
     * Gets object at path from local data store
     *
     * @private
     * @param {string} path the path at which to fetch the object
     * @return {object} object the object at that path
     */
    _get_local(path) {

        // Empty path means get everything
        if(path==="") return this._local_data;

        try {
    
            return path.split(".").reduce((p,v)=>p[v],this._local_data);

        } catch(e) {

            return undefined;
        }
    }

    /**
     * Is beneath
     *
     * Is a under b? E.g. is "system.bus.voltage" eqaual to or beneath "system.bus"?
     *
     * @private
     * @param {string} a the string tested for "insideness"
     * @param {string} b the string tested for "outsideness"
     * @return boolean
     */
    _is_beneath(a, b) {

        // Everything is beneath the top ("")
        if(b==="") return true;

        // If paths are both blank, they are equal
        if(b==="" && a==="") return true;

        let A=a.split(".");
        let B=b.split(".");

        // A is not beneath B if any part is not the same
        while(A.length && B.length){

            if(A.shift()!=B.shift()) return false;
        }

        // A is not beneath B if B is longer
        if(B.length) return false;

        return true;
    }



}

/** 
 * Deep copy an object
 *
 * Uses JSON parse methods so things that don't work in JSON will disappear, with the special exception of functions which  
 * are replaced by their return values (or if the function returns a promise, the value that it resolves to).
 *
 * If you pass undefined, it will return a promise resolving to undefined.
 * 
 * @param {object} o the object to copy.  
 * @return {Promise} result a promise resolving to a completely new, de-referenced object only containing objects and values
 */
function dereferenced_copy(original) {

    // Undefined passes through
    if(typeof(original)=="undefined") return new Promise((res)=>{ res(undefined);});

    // Make a copy of o.  It will be missing any functions
    let copy=JSON.parse(JSON.stringify(original));

    // A container to hold the copy (so we can have a recursive function replace it using a key)
    let container={ "copy" : copy};

    // We will store our promises here
    let promises=[];

    // Recursively call all functions in o, placing their values in copy.  Promises are tracked also.
    function recurse(o, c, parent, key){

        // If o is a function, get its value and return a promise
        if(typeof(o)=="function"){

            // Call the function
            let result=o();

            // If the function itself returns a promise, save it and make it replace the object with a result
            if(result && result.constructor && result.constructor.name && result.constructor.name=="Promise"){

                promises.push(promises, result);
                result.then((val)=>{

                    parent[key]=val;
                });
            } else {

                // Replace the object directly
                parent[key]=result;
            }

            return;
        }


        // If o is not an object, return
        if(typeof(o)!="object") return;

        // Otherwise, iterate keys and call ourselves recursively
        for(let key in o){

            recurse(o[key], c[key], c, key);
        }
    }

    recurse(original, copy, container, "copy");

    // Wait for all promises to fulfil, then return the copy
    return Promise.all(promises).then(()=>Promise.resolve(copy));
}

/** 
 * Partial copy
 *
 * Return a partial copy of an object (depth limited).  DOES NOT DE-REFERENCE!
 *
 * @private
 * @param {object} object the object to copy
 * @param {number} max_depth the maximum depth to copy (max_depth==0 returns object keys)
 */
function partial_copy(o, max_depth) {

    // Trivial case, return object untouched if no max_depth
    if(typeof(max_depth)!="number") return o;

    // If max_depth has been exceeded, return an empty object or array
    if(max_depth<0) return (Array.isArray(o))?[]:{};

    // If o is not an object, return it
    if(typeof(o)!="object") return o;

    // Otherwise, iterate keys and call ourselves recursively
    let c={};
    for(let key in o){

        if(typeof(o[key])!="object"){

            c[key]=o[key];

        } else {

            c[key]=partial_copy(o[key], max_depth-1);      
        }
    }

    return c;
 }

module.exports=exports=Entangld;

