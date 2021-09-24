const Entangld=require("../index.js");
const sockhop=require("sockhop");
const assert=require("assert");

function wait (ms) {
    return new Promise(res=>setTimeout(res,ms));
}

// FIXME : comment out for debugging
console.log = () => {};

describe("Sockets", function() {
    let server,client,sock_ref,s,a,b;

    beforeEach(function() {
        s = new Entangld();
        a = new Entangld();

        server = new sockhop.server({
            address : "localhost",
            port : 9876
        })
        server.on("receive", (o, meta) => { console.log("s.r",o); s.receive(o, meta.socket) } );
        client = new sockhop.client({
            address : "localhost",
            port : 9876
        })
        client.on("receive", (o, meta) => { console.log("c.r",o); a.receive(o, client) });


        s.transmit((msg, socket) => { // server's transmit to net-sockets
            console.log("s.t",msg);
            if ( socket.readyState == 'open' ) server.send(socket, msg);
        });
        a.transmit((msg, client) => { // client's transmit to sockhop client
            console.log("a.t",msg);
            if ( client.connected ) client.send(msg);
        });


        server.on('connect', ( socket ) => {
            sock_ref = socket;
            s.detach('path1.a');
            s.attach('path1.a',socket);
        });
    });

    afterEach(function() {
        delete s;
        delete a;
        server.close();
        delete server;
        delete client;
    });

    it("Can subscribe", function(done) {
        server.listen().then(async() => {
            client.connect();
            while ( !sock_ref ) await wait(1);
            while ( sock_ref.readyState !== "open" ) await wait(1);
            let f = false;
            s.subscribe("path1.a.data", () => { f = true; done(); });
            await wait(5); // wait for subscription to clear
            a.set('data',1);
            await wait(5); // wait for return to clear
            if ( !f ) done(new Error("Subscription return never got to server"));
        });
    });

    it("Can get", function(done) {
        server.listen().then(async() => {
            client.connect();
            while ( !sock_ref ) await wait(1);
            while ( sock_ref.readyState !== "open" ) await wait(1);
            a.set('data',1);
            let res = await s.get("path1.a.data");
            if ( res !== 1 ) done(new Error("Bad data from get"));
            else done();
        });
    });

    it("Can remove subs for persistant sockets", function(done) {
        server.listen().then(async() => {
            client.connect();
            while ( !sock_ref ) await wait(1);
            while ( sock_ref.readyState !== "open" ) await wait(1);
            s.subscribe("path1.a.data");
            while ( a._subscriptions.length < 1 ) await wait(1);
            s.detach("path1.a")
            s.attach("path1.a",new Entangld());
            await wait(5); // set messages clear
            if ( a._subscriptions.length !== 0 ) done(new Error("Subscription never removed"));
            else done();
        });
    });

    it("Cannot remove subs for dropped sockets", function(done) {
        server.listen().then(async() => {
            client.connect();
            while ( !sock_ref ) await wait(1);
            while ( sock_ref.readyState !== "open" ) await wait(1);
            s.subscribe("path1.a.data");
            while ( a._subscriptions.length < 1 ) await wait(1);
            client.disconnect(); // kill the socket
            s.detach("path1.a")
            s.attach("path1.a",new Entangld());
            await wait(5); // set messages clear
            if ( a._subscriptions.length !== 1 ) done(new Error("Subscription was removed!?"));
            else done();
        });
    });

    it("Can remove subs for reconnected sockets", function(done) {
        server.listen().then(async() => {
            client.connect();
            while ( !sock_ref ) await wait(1);
            while ( sock_ref.readyState !== "open" ) await wait(1);
            let flag = false;
            s.subscribe("path1.a.data",() => {
                done();
                flag = true;
            });
            while ( a._subscriptions.length < 1 ) await wait(1);
            client.disconnect(); // kill the socket
            await await(5);
            // Reconnect the client
            sock_ref = null;
            client = new sockhop.client({
                address : "localhost",
                port : 9876
            })
            client.on("receive", (o, meta) => { console.log("c.r",o); a.receive(o, client) });
            client.connect();
            while ( !sock_ref ) await wait(1);
            while ( sock_ref.readyState !== "open" ) await wait(1);

            if ( a._subscriptions.length !== 1 ) {
                // a still has the old subscription from before the the socket
                // was destroyed
                done(new Error("Subscription not cleaned up in resubscribe"));
                return;
            }
            a.set("data",1); // Should trigger subscription, and call done
            await wait(5);
            if ( !flag ) done(new Error("Never got resubscribe from reconnection event"));
        });
    });
});
