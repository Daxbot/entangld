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
	a.transmit((msg)=>s.receive(msg, a));
	b.transmit((msg)=>s.receive(msg, b));

	it("Subscribe to local event (exact)", (done)=>{

		s.subscribe("my.own.event",(path, val)=>{

			assert.equal(path,"my.own.event");
			assert.equal(val, "hello");

			done();
		});

		s.set("my.own.event","hello");
	});

	it("Unsubscribe to local event", ()=>{

		s.unsubscribe("my.own.event");
		assert.equal(s._subscriptions.length,0);
	});

	it("Subscribe to remote event (exact)", (done)=>{

		s.subscribe("a.system.voltage",(path, val)=>{

			assert.equal(path,"a.system.voltage");
			assert.equal(val, 21);

			// Check for proper internals
			assert.equal(s._subscriptions.length,1);
			assert.equal(a._subscriptions.length,1);
			done();
		});

		a.set("system.voltage",21);
	});

	it("Subscribe to remote event (descendant of subscribed path also triggers event)", (done)=>{

		s.subscribe("a.flowers.roses",(path, val)=>{

			assert.equal(path, "a.flowers.roses.color");
			assert.deepEqual(val, "blue");
			assert.equal(s._subscriptions.length,2);
			assert.equal(a._subscriptions.length,2);
			done();
		});

		a.set("flowers.roses.color","blue");
	});


	it("Subscribe to remote event (setting parent variable not triggers subscription to child)", ()=>{

		s.subscribe("b.bonnets.bees",()=>assert(false));
		assert.equal(s._subscriptions.length,3);
		assert.equal(b._subscriptions.length,1);
		b.set("bonnets","");

	});

	it("Unsubscribe to remote event", ()=>{

		s.subscribe("a.foo.bar",()=>assert(false));
		assert.equal(s._subscriptions.length,4);
		assert.equal(a._subscriptions.length,3);
		s.unsubscribe("a.foo.bar");
		assert.equal(s._subscriptions.length,3);
		assert.equal(a._subscriptions.length,2);
		s.set("a.foo.bar","");
	});

	it("Unsubscribe tree", ()=>{

		s.unsubscribe_tree("a");
		assert.equal(s._subscriptions.length,1);
		assert.equal(a._subscriptions.length,0);
		assert.equal(b._subscriptions.length,1);

		// // Clean up, now that we are done with b
		// s.unsubscribe("b.bonnets.bees");

	});


	it("Subscribe to local event (descendant of subscribed path also triggers event)", (done)=>{

		s.subscribe("my.own.other",(path, val)=>{

			assert.equal(path,"my.own.other.event");
			assert.equal(val, "hello");

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

			assert.equal(path,"x.something");
			assert.equal(val, 21);

			done();
		});

		x.set("something",21);
	});


	it("Child subscribe to sibling event", (done)=>{

		a.subscribe("parent.b.rubbish.bin",(path, val)=>{

			assert.equal(path,"parent.b.rubbish.bin");
			assert.equal(val, "boot");

			done();
		});

		b.set("rubbish.bin","boot");
	});



});
