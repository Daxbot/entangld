const Entangld=require("../index.js");
const assert=require("assert");


describe("Events",()=>{

    var s=new Entangld();
    var a=new Entangld();
    var b=new Entangld();

    s.attach("a",a);
    s.attach("b",b);

    a.attach("parent", s);
    b.attach("parent", s);

    s.transmit((msg, store)=>store.receive(msg, s));
    a.transmit((msg, store)=>store.receive(msg, a));
    b.transmit((msg, store)=>store.receive(msg, b));

    it("Subscribe to local event (exact)", (done)=>{

        s.subscribe("my.own.event",(path, val)=>{

            assert.strictEqual(path,"my.own.event");
            assert.strictEqual(val, "hello");

            done();
        });

        s.set("my.own.event","hello");
    });

    it("Unsubscribe to local event", ()=>{

        s.unsubscribe("my.own.event");
        assert.strictEqual(s._subscriptions.length,0);
    });

    it("Subscribe to remote event (exact)", (done)=>{

        s.subscribe("a.system.voltage",(path, val)=>{

            assert.strictEqual(path,"a.system.voltage");
            assert.strictEqual(val, 21);

            // Check for proper internals
            assert.strictEqual(s._subscriptions.length,1);
            assert.strictEqual(a._subscriptions.length,1);
            done();
        });

        a.set("system.voltage",21);
    });

    it("Subscribe to remote event (descendant of subscribed path also triggers event)", (done)=>{

        s.subscribe("a.flowers.roses",(path, val)=>{

            assert.strictEqual(path, "a.flowers.roses.color");
            assert.deepStrictEqual(val, "blue");
            assert.strictEqual(s._subscriptions.length,2);
            assert.strictEqual(a._subscriptions.length,2);
            done();
        });

        a.set("flowers.roses.color","blue");
    });

    it("Subscribe to remote event (setting parent variable not triggers subscription to child)", ()=>{

        s.subscribe("b.bonnets.bees",()=>assert(false));
        assert.strictEqual(s._subscriptions.length,3);
        assert.strictEqual(b._subscriptions.length,1);
        b.set("bonnets","");

    });

    it("Unsubscribe to remote event", ()=>{

        s.subscribe("a.foo.bar",()=>assert(false));
        assert.strictEqual(s._subscriptions.length,4);
        assert.strictEqual(a._subscriptions.length,3);
        s.unsubscribe("a.foo.bar");
        assert.strictEqual(s._subscriptions.length,3);
        assert.strictEqual(a._subscriptions.length,2);
        s.set("a.foo.bar","");
    });

    it("Unsubscribe tree", ()=>{

        s.unsubscribe_tree("a");
        assert.strictEqual(s._subscriptions.length,1);
        assert.strictEqual(a._subscriptions.length,0);
        assert.strictEqual(b._subscriptions.length,1);

        // // Clean up, now that we are done with b
        // s.unsubscribe("b.bonnets.bees");

    });

    it("Subscribe to local event (descendant of subscribed path also triggers event)", (done)=>{

        s.subscribe("my.own.other",(path, val)=>{

            assert.strictEqual(path,"my.own.other.event");
            assert.strictEqual(val, "hello");

            done();
        });

        s.set("my.own.other.event","hello");
    });

    var x=new Entangld();
    var y=new Entangld();

    x.attach("y",y);
    y.attach("x",x);

    x.transmit((msg, store)=>store.receive(msg, x));
    y.transmit((msg)=>x.receive(msg, y));

    it("Child subscribe to parent event", (done)=>{

        y.subscribe("x.something",(path, val)=>{

            assert.strictEqual(path,"x.something");
            assert.strictEqual(val, 21);

            done();
        });

        x.set("something",21);
    });

    it("Child subscribe to sibling event", (done)=>{

        a.subscribe("parent.b.rubbish.bin",(path, val)=>{

            assert.strictEqual(path,"parent.b.rubbish.bin");
            assert.strictEqual(val, "boot");

            done();
        });

        b.set("rubbish.bin","boot");
    });

    it("Child subscribe to sibling event (before sibling attaches)", (done)=>{

        var c=new Entangld();

        a.subscribe("parent.c.rubbish.bin",(path, val)=>{

            assert.strictEqual(path,"parent.c.rubbish.bin");
            assert.strictEqual(val, "boot");

            done();
        });

        s.attach("c",c);
        c.attach("parent", s);
        c.transmit((msg)=>s.receive(msg, c));

        c.set("rubbish.bin","boot");
    });

});
