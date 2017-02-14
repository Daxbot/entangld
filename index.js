//var EventEmitter=require("events");
var Uuid=require("uuid");

class Ses_Message {

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
class Ses /* extends EventEmitter */{

    constructor(){

//        super();  // Don't need unless we extend something 
        //var _self=this;
        this._stores=new Map();
        this._namespaces=new Map();

        this._transmit=()=>{};
        this._local_data={};
        this._requests={};
        this._subscriptions=[] ;
    }

    get namespaces() {

        return Array.from(this._stores.keys());
    }

    namespace(store) {

        return this._namespaces(store);
    }

    attach(namespace, store){

        // Sanity checks
        if(!store) throw new Error("You cannot attach() a null or empty store");
        if(!namespace) throw new Error("You cannot attach() a null or empty namespace");
        if(this._stores.has(namespace)) throw new Error("You already attach()ed that namespace");

        // Attach the store and namespace
        this._stores.set(namespace,store);
        this._namespaces.set(store, namespace);
    }

    detach(namespace, store){

        if(!namespace && !store) throw new Error("You must specify at least one store or namespace when calling detach()");

        if(!store) store=this._stores.get(namespace);
        if(!namespace) namespace=this._namespaces.get(store);

        return (this._stores.delete(namespace) && this._namespaces.delete(store));
    }

    transmit(f) {

        this._transmit=f;
    }

    receive(msg, store) {

        // Remote "set" request
        if(msg.type=="set") {

            this.set(msg.path, msg.value);

        // Remote "get" request
        } else if(msg.type=="get") {

            this.get(msg.path).then((val)=>{

                this._transmit(new Ses_Message("value", msg.path, val, msg.uuid), store);
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

                if (this._is_contained_by(path, s.path)){

                    // Call the callback
                    s.callback(path, msg.value);
                    count++;
                }
            }

            // If no callbacks were called, we should maybe inform the child that no one is listening (?)
            if(count===0) throw new Error("Store sent an event that no one subscribed to");

        // Incoming remote subscription request
        } else if(msg.type=="subscribe"){

            this._subscriptions.push({path: msg.path, callback: (path, val)=>{

                // This is a remote subscription, so when we are called we need to send the value
                this._transmit(new Ses_Message("event", path, val));
            }});            

        // Default
        } else {

            throw new Error ("Received unknown message: "+JSON.stringify(msg));
        }
    }

    set(path, o) {

        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this._stores.get(tree.shift());

        // Set local or remote item
        if(store===undefined) {

            this._set_local(path,o);

            // Check subscriptions to see if we need to run an event
            for(let s of this._subscriptions){

                if (this._is_contained_by(path, s.path)){

                    s.callback(path, o);
                }
            }

        } else {
         
            this._transmit(new Ses_Message("set", tree.join("."), o), store);
        }

    }

    get(path) {

        // Sanity check
        if(!path || typeof(path) !="string") throw new Error("path is null or not set to a string");

        // Turn the path string into an array
        let tree=path.split(".");

        // Get the remote store
        let store=this._stores.get(tree.shift());

        // If store is undefined, we are getting a local item
        if(store===undefined) {

            let o=this._get_local(path);
            return new Promise((res)=>res((typeof(o)=="function")?o():o));
        }

        // Request the data from the remote store
        var msg=new Ses_Message("get", tree.join("."));
        var _this=this;
        return new Promise((res)=>{

            _this._requests[msg.uuid]=res;
            this._transmit(msg, store);            
        });

    }

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
        var msg=new Ses_Message("subscribe", tree.join("."));
        this._transmit(msg, store);            

    }

    _set_local(path, o){

        let elements=path.split(".");
        let last=elements.pop();
        let pointer=this._local_data;

        for(let el of elements){

            if(!pointer[el]) pointer[el]={};
            pointer=pointer[el];
        }

        pointer[last]=o;
    }

    _get_local(path) {

        try {
    
            return path.split(".").reduce((p,v)=>p[v],this._local_data);

        } catch(e) {

            return undefined;
        }
    }

    /**
     * Is contained by
     *
     * Is a under b? E.g. is "system.bus.voltage" inside "system.bus"?
     *
     * @param a string tested for "insideness"
     * @param b string tested for "outsideness"
     * @return boolean
     */
    _is_contained_by(a, b) {

        let A=a.split(".");
        let B=b.split(".");

        while(A.length && B.length){

            if(A.shift()!=B.shift()) return false;
        }

        return true;
    }

}


module.exports=exports=Ses;

