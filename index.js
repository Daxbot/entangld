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
        this._partial_copy=partial_copy;        // So it is accessible for testing
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
            if(count===0) throw new Error("Store sent an event that no one is subscribed to");

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

                // Unsubscribe from one
                let idx=this._subscriptions.reduce((p,v,i)=>p||((v.path==msg.path)?i:null),null);
                if(idx!==null) this._subscriptions.splice(idx,1);        
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
     * @param {object} the object you want to set it to
     * @throws {Error} Throws error on empty path
     */
    set(path, o) {

        // Sanity check
        if(typeof(path) !="string") throw new Error("path must be a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this._stores.get(tree.shift());

        // Set local or remote item
        if(store===undefined) {

            this._set_local(path,o);

            // Check subscriptions to see if we need to run an event
            for(let s of this._subscriptions){

                if (this._is_beneath(path, s.path)){

                    s.callback(path, o);
                }
            }

        } else {
         
            this._transmit(new Entangld_Message("set", tree.join("."), o), store);
        }

    }
 
    /**
     * Get an object from the store
     *
     * Note: using max_depth, especially large max_depth, involves a lot of recursion and may be expensive
     *
     * @param {string} path the path to query (like "system.voltage")
     * @param [params|max_depth] the parameters to be passed to the remote function (RPC) or the maximum depth of the returned object (normal mode)
     * @throws {Errror} throws error 
     * @return {Promise} the object living at that path
     */ 
    get(path, params) {

        // Sanity check
        if(typeof(path) !="string") throw new Error("path must be a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this._stores.get(tree.shift());

        // If store is undefined, we are getting a local item
        if(store===undefined) {

            // Get a reference to the object
            let o=this._get_local(path);

            // If it is a function, call it and return the result
            if(typeof(o)=="function"){

                return new Promise((res)=>res(o(params)));                
            }

            // If params is a number, use it as a max depth and return a partial copy
            if(typeof(params)=="number"){

                return new Promise((res)=>res(partial_copy(o,params)));
            }

            // Default: return the entire object as-is
            return new Promise((res)=>res(o));
        }

        // Request the data from the remote store
        var msg=new Entangld_Message("get", tree.join("."), params);
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

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store_name=tree.shift();
        let store=this._stores.get(store_name);

        // Undefined store means we are trying to subscribe to something 
        if(store===undefined) throw new Error("Unable to subscribe to nonexistent store (please attach '"+store_name+"' first)");

        // Add to our subscriptions list
        this._subscriptions.push({path: path, callback: f});

        // Tell the store that we are subscribing
        var msg=new Entangld_Message("subscribe", tree.join("."));
        this._transmit(msg, store);            

    }

    /**
     * Unubscribe to change events for a path
     *
     * @param {string} path the path to watch
     * @throws {Error}
     */
    unsubscribe(path) {

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store_name=tree.shift();
        let store=this._stores.get(store_name);

        // Undefined store means we are trying to subscribe to something 
        if(store===undefined) throw new Error("Unable to unsubscribe to nonexistent store (please attach '"+store_name+"' first)");

        if(tree.length===0){

            // Unsubscribe from all
            this._subscriptions=this._subscriptions.filter((s)=>!s.path.startsWith(store_name+"."));
    
        } else {

            // Unsubscribe from one
            let idx=this._subscriptions.reduce((p,v,i)=>p||((v.path==path)?i:null),null);
            if(idx===null) throw new Error("Cannot unsubscribe to event that was not previously subscribed");
            this._subscriptions.splice(idx,1);        
        }


        // Tell the store that we are unsubscribing
        var msg=new Entangld_Message("unsubscribe", tree.join("."));
        this._transmit(msg, store);            
    }


    /**
     * Set local object
     *
     * Sets object into local data store
     *
     * @private
     * @param {string} path the path at which to store the object
     * @param {object} object the object to store
     */
    _set_local(path, o){

        // Empty path means set everything
        if(path==="") {

            // Sanity check
            if(typeof(o)!="object") throw new Error("You are trying to set the root store to something ("+typeof(o)+") besides an object!");

            this._local_data=o;
            return;
        }

        let elements=path.split(".");
        let last=elements.pop();
        let pointer=this._local_data;

        for(let el of elements){

            if(!pointer[el]) pointer[el]={};
            pointer=pointer[el];
        }

        pointer[last]=o;
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
     * @param a string tested for "insideness"
     * @param b string tested for "outsideness"
     * @return boolean
     */
    _is_beneath(a, b) {

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

