
/**
 * Deep copy an object
 *
 * Uses JSON parse methods so things that don't work in JSON will disappear,
 * with the special exception of functions which are replaced by their return
 * values (or if the function returns a promise, the value that it resolves to).
 *
 * If you pass undefined, it will return a promise resolving to undefined.
 *
 * @private
 * @param {object} original the object to copy.
 * @return {Promise} a promise resolving to a completely new, de-referenced
 * object containing only objects and values.
 */
function dereferenced_copy(original) {

    // Undefined passes through
    if (original === undefined)
        return new Promise((res) => { res(undefined); });

    // Make a copy of o.  It will be missing any functions
    let copy = JSON.parse(JSON.stringify(original));

    // A container to hold the copy (so we can have a recursive function
    // replace it using a key)
    let container = { "copy": copy };

    // We will store our promises here
    let promises = [];

    // Recursively call all functions in o, placing their values in copy.
    // Promises are tracked also.
    function recurse(o, c, parent, key) {

        // If o is a function, get its value and return a promise
        if (typeof (o) == "function") {

            // Call the function
            let result = o();

            // If the function itself returns a promise, save it and make it
            // replace the object with a result
            if (result && result.constructor && result.constructor.name
                && result.constructor.name == "Promise") {

                promises.push(promises, result);
                result.then((val) => {

                    parent[key] = val;
                });
            } else {

                // Replace the object directly
                parent[key] = result;
            }

            return;
        }


        // If o is not an object, return
        if (typeof (o) != "object") return;

        // Otherwise, iterate keys and call ourselves recursively
        for (let key in o) {

            recurse(o[key], c[key], c, key);
        }
    }

    recurse(original, copy, container, "copy");

    // Wait for all promises to fulfil, then return the copy
    return Promise.all(promises).then(() => Promise.resolve(copy));
}


/**
 * Extract from path.
 *
 * Given an object, extracts a child object using a string path.
 *
 * @private
 * @param {object} obj the object we are extracting from.
 * @param {string} path the path to find beneath obj.
 * @return {Array<object, string>} array containing [result, remaining_path].
 * result will be undefined if path can't be found.  If we encounter a function
 * in our search, result will be the function and remaining_path will be the
 * remaining part of path.
 */
function extract_from_path(obj, path) {

    // Empty path means get everything
    if (path === "") return [obj, ""];


    let keys = path.split(".");
    let key;
    let o = obj;

    while ((key = keys.shift())) {

        if (key in o) {

            o = o[key];

            // If o is a function, we can't go any farther
            if (typeof (o) == "function") {

                return [o, keys.join(".")];
            }

        } else {

            return [undefined, ""];
        }

    }

    return [o, ""];
}

/**
 * Partial copy.
 *
 * Return a partial copy of an object (depth limited).  DOES NOT DE-REFERENCE!
 *
 * @private
 * @param {object} object the object to copy
 * @param {number} max_depth the maximum depth to copy (0 returns object keys)
 * @return {object} partial copy of an object limited by max_depth.
 */
function partial_copy(o, max_depth) {

    // Trivial case, return object untouched if no max_depth
    if (typeof (max_depth) != "number") return o;

    // If o is not an object, return it
    if (typeof (o) != "object") return o;

    let c =  (Array.isArray(o)) ? [] : {};

    // If max_depth has been exceeded, return the empty object or array
    if (max_depth < 0) return c;

    // Otherwise, iterate keys and call ourselves recursively
    for (let key in o) {

        if (typeof (o[key]) != "object") {

            c[key] = o[key];

        } else {

            c[key] = partial_copy(o[key], max_depth - 1);
        }
    }

    return c;
}

/**
 * Is beneath
 *
 * Is `a` under `b`? E.g. is "system.bus.voltage" equal to or beneath "system.bus"?
 *
 * @private
 * @param {string} a the string tested for "insideness"
 * @param {string} b the string tested for "outsideness" (wildcard '*' allowed)
 * @param {string} [allow_wildcard = false] allow wildcards, one of ('a', 'b', false).  Default is false (no wildcard allowed)
 * @return boolean
 */
function is_beneath(a, b, allow_wildcard=false) {

    // Everything is beneath the top ("")
    if(b==="") return true;

    // If paths are both blank, they are equal
    if(b==="" && a==="") return true;

    let A=a.split(".");
    let B=b.split(".");

    // A is not beneath B if any part is not the same.  Check for this.
    switch (allow_wildcard) {

        case "a":
        // Allow wildcard in A
            while(A.length && B.length){

                let A_part=A.shift();
                if(A_part!=B.shift() && A_part != "*") return false;
            }
            break;

        case "b":
        // Allow wildcard in B
            while(A.length && B.length){

                let B_part=B.shift();
                if(B_part!=A.shift() && B_part != "*") return false;
            }
            break;

        default:
        // No wildcards allowed
            while(A.length && B.length){

                if(A.shift()!=B.shift()) return false;
            }
    }

    // A is not beneath B if B is longer
    if(B.length) return false;

    return true;
}

function parameter_parser(func_string) {
    let out = "";
    let reading = false;
    let inside = 0;
    for ( const char of func_string ) {
        if ( !reading ) {
            if ( char === "(" ) reading = true;
            continue;
        }
        switch ( char ) {
            case "(":
            case "{":
            case "[":
                inside++;
                break;
            case ")":
            case "}":
            case "]":
                inside--;
                break;
            case ",":
                if ( inside == 0 ) {
                    out += "\x00";
                    continue;
                } else {
                    out += char;
                }
                break;
            default:
                out += char;
        }

        if ( inside < 0 ) break;
    }
    return out.split("\x00").map((p)=>p.trim()).filter((p)=>p.length);
}

module.exports = exports = {
    is_beneath,
    extract_from_path,
    partial_copy,
    dereferenced_copy,
    parameter_parser
};
