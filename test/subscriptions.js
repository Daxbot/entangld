var Entangld=require("../index.js").Datastore;
var assert=require("assert");

describe("Subscription", function() {
    let s,a,b;

    beforeEach(function() {
        s = new Entangld();
        a = new Entangld();
        b = new Entangld();

        s.attach("path1.A",a);
        s.attach("path2.B",b);
        a.attach("path3.B",b);

        s.transmit((msg, store)=>store.receive(msg, s));
        a.transmit((msg, store)=>store.receive(msg, a));
        b.transmit((msg, store)=>store.receive(msg, b));
    });

    afterEach(function() {
        delete s;
        delete a;
        delete b;
    });

    it("Should only trigger subscriptions on an exact match", function(done) {
        s.subscribe('test', () => {
            assert.fail("Function should not be called");
        });

        s.set('test2', {});

        done();
    });

    it("Should emit on recieved subscriptions (locally)", function(done) {
        s.on("subscription", ( path, uuid ) => {
            if ( path === "test" ) { done(); return; }
            assert.fail("Subcription yield path " + path);
        });
        s.subscribe('test', () => {});
    });
    it("Should emit on recieved unsubscriptions (locally)", function(done) {
        s.on("unsubscription", ( path, uuid ) => {
            if ( path === "test" ) { done(); return; }
            assert.fail("Subcription yield path " + path);
        });
        s.subscribe('test', () => {});
        s.unsubscribe('test');
    });

    it("Should emit on recieved subscriptions (remote)", function(done) {
        a.on("subscription", ( path, uuid ) => {
            if ( path === "some_data" ) { done(); return; }
            assert.fail("Subcription yield path " + path);
        });
        s.subscribe('path1.A.some_data', () => {});
    });
    it("Should emit on recieved unsubscriptions (remote)", function(done) {
        a.on("unsubscription", ( path, uuid ) => {
            if ( path === "some_data" ) { done(); return; }
            assert.fail("Subcription yield path " + path);
        });
        s.subscribe('path1.A.some_data', () => {});
        s.unsubscribe('path1.A.some_data');
    });

    it("Shouldn't emit on sent subscriptions (remote)", function(done) {
        s.on("subscription", ( path, uuid ) => {
            assert.fail("this shouldn't run");
        });
        s.subscribe('path1.A.path3.B.something', () => {});

        done();
    });
    it("Shouldn't emit on sent unsubscriptions (remote)", function(done) {
        s.on("unsubscription", ( path, uuid ) => {
            assert.fail("this shouldn't run");
        });
        s.subscribe('path1.A.path3.B.something', () => {});
        s.unsubscribe('path1.A.path3.B.something', () => {});

        done();
    });
    it("Shouldn't emit on passthrough subscriptions (remote)", function(done) {
        a.on("subscription", ( path, uuid ) => {
            assert.fail("this shouldn't run");
        });
        s.subscribe('path1.A.path3.B.something', () => {});

        done();
    });
    it("Shouldn't emit on passthrough unsubscriptions (remote)", function(done) {
        a.on("unsubscription", ( path, uuid ) => {
            assert.fail("this shouldn't run");
        });
        s.subscribe('path1.A.path3.B.something', () => {});
        s.unsubscribe('path1.A.path3.B.something', () => {});

        done();
    });

    it("Emit on each subscription", function(done) {
        let count = 0;
        b.on("subscription", ( path, uuid ) => {
            count += 1;
            assert.strictEqual(path, "something");
        });
        s.subscribe('path1.A.path3.B.something', () => {});
        s.subscribe('path1.A.path3.B.something', () => {});
        assert.strictEqual(count,2);

        done();
    });

    it("Can have parallel subscriptions (locallly)", function(done) {

        var count = 0;
        // Create two subscriptions
        s.subscribe("some_data", () => {count += 1;});
        s.subscribe("some_data", () => {count += 1;});

        s.set('some_data', 0.0);

        assert.strictEqual(count, 2);

        done();
    });

    it("Can (not) throttle subscription messages (locally)", (done) => {
        var count = 0;
        s.subscribe("some_data", (path, value) => { count += 1; }, 1);
        for ( let i = 0; i < 10; i ++ ) {
            s.set("some_data", 1);
        }
        assert.strictEqual(count, 10);
        done();
    });

    it("Can throttle subscription messages (locally)", (done) => {
        var count = 0;
        s.subscribe("some_data", (path, value) => { count += 1; }, 2);
        for ( let i = 0; i < 10; i ++ ) {
            s.set("some_data", 1);
        }
        assert.strictEqual(count, 5);
        done();
    });

    it("Can throttle subscription messages (remote)", (done) => {
        var count = 0;
        s.subscribe("path1.A.path3.B.some_data", (path, value) => { count += 1; }, 2);
        for ( let i = 0; i < 10; i ++ ) {
            b.set("some_data", 1);
        }
        assert.strictEqual(count, 5);
        done();
    });

    it("Can have parallel subscriptions (locallly)", function(done) {

        var count = 0;
        // Create two subscriptions
        s.subscribe("some_data", () => {count += 1;});
        s.subscribe("some_data", () => {count += 1;});

        s.set('some_data', 0.0);

        assert.strictEqual(count, 2);

        done();
    });

    it("Can have parallel subscriptions (remote)", function(done) {

        var count = 0;
        // Create two subscriptions
        s.subscribe("path1.A.some_data", () => {count += 1;});
        s.subscribe("path1.A.some_data", () => {count += 1;});

        a.set('some_data', 0.0);

        assert.strictEqual(count, 2);

        done();
    });

    it("Can get list of subscriptions", (done) => {
        s.subscribe("num1", () => {});
        s.subscribe("path1.A.num1", () => {});
        s.subscribe("path1.A.path3.B.num1", () => {});
        assert.strictEqual(s.subscriptions.length, 3);
        assert.strictEqual(a.subscriptions.length, 2);
        assert.strictEqual(b.subscriptions.length, 1);
        done();
    });

    it("Unsubscribing paths removes all paths", (done)=>{

        var count = 0;
        // Create two subscriptions
        s.subscribe("some_data", () => {count += 1;});
        s.subscribe("some_data", () => {count += 1;});

        s.unsubscribe("some_data");

        s.set('some_data', 0.0);

        assert.strictEqual(count, 0);

        done();
    });


    it("Unsubscribing uuid only removes correct subscription", (done)=>{

        var count = 0;
        // Create two subscriptions
        let uuid1 = s.subscribe("some_data", () => {count += 1;});
        let uuid2 = s.subscribe("some_data", () => {count += 1;});

        s.unsubscribe(uuid1);

        s.set('some_data', 0.0);

        assert.strictEqual(count, 1);
        assert.strictEqual(s._subscriptions.length, 1);
        assert.strictEqual(s._subscriptions[0].uuid, uuid2);

        done();
    });

    it("Pairs of remote stores can subscribe to the same data", (done)=>{

        var count = 0;
        s.subscribe("path2.B.some_data", () => {count += 1;});
        a.subscribe("path3.B.some_data", () => {count += 1;});

        b.set("some_data",0.0);

        assert.strictEqual(count, 2);

        done();
    });


    it("Pairs of remote stores don't unsubscribe each other", (done)=>{

        var count = 0;
        let uuid1 = s.subscribe("path2.B.some_data", () => {count += 1;});
        let uuid2 = a.subscribe("path3.B.some_data", () => {count += 1;});

        s.unsubscribe("path2.B.some_data");

        b.set("some_data",0.0);

        assert.strictEqual(count, 1);
        assert.strictEqual(b._subscriptions.length, 1);
        assert.strictEqual(b._subscriptions[0].uuid, uuid2);

        done();
    });

    it("Orphaned remote subscriptions are successfully cleaned up", (done) => {

        var number_of_cancels_sent = 0;
        var number_of_events = 0;


        s.transmit((msg, store)=> {
            if (msg.type==="unsubscribe") number_of_cancels_sent += 1;
            store.receive(msg, s);
        });
        a.transmit((msg, store)=> {
            if (msg.type==="event") number_of_events += 1;
            store.receive(msg, a);
        });


        s.subscribe("path1.A.some_data", () => {});

        // orphan the pass through subscription object in A
        s._subscriptions = [];

        a.set("some_data",0.0);

        // The cancel message was sent from S to A
        assert.strictEqual(number_of_cancels_sent,1);
        assert.strictEqual(number_of_events,1);

        a.set("some_data",0.0);

        // A didn't sent the next next event
        assert.strictEqual(number_of_events,1);

        done();
    });

    it("Local sets only triggers a single subscribed callback when multiple subscriptions co-exist", (done)=>{

        // Subscribe once to a local endpoint
        var sub_1_triggers = 0;
        s.subscribe("some_data",(path, val)=>{
            sub_1_triggers += 1;
            assert.strictEqual(sub_1_triggers, 1);
        });

        // Subscribe again to the same local endpoint
        var sub_2_triggers = 0;
        s.subscribe("some_data",(path, val)=>{
            sub_2_triggers += 1;
            assert.strictEqual(sub_2_triggers, 1);
        });

        s.set("some_data",0);

        done();
    });

    it("Remote event only triggers a single subscribed callback when multiple subscriptions co-exist", (done)=>{

        // Subscribe once to a remote endpoint
        var sub_1_triggers = 0;
        s.subscribe("path1.A.some_data",(path, val)=>{
            sub_1_triggers += 1;
            assert.strictEqual(sub_1_triggers, 1);
        });

        // Subscribe again to the same remote endpoint
        var sub_2_triggers = 0;
        s.subscribe("path1.A.some_data",(path, val)=>{
            sub_2_triggers += 1;
            assert.strictEqual(sub_2_triggers, 1);
        });

        a.set("some_data",0);

        done();
    });

});
