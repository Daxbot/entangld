const Entangld = require("./lib/Datastore.js");

// Attach objects for destructuring requires
Entangld.Datastore = require("./lib/Datastore.js");
Entangld.error = require("./lib/error.js");
Entangld.Message = require("./lib/Message.js");
Entangld.Subscription = require("./lib/Subscription.js");
Entangld.utils = require("./lib/utils.js");

module.exports = exports = Entangld;
