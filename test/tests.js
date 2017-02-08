var Ses=require("../index.js");
var assert=require("assert");


describe("Local storage",()=>{

	it("Set/get value",()=>{

		let s=new Ses();
		s.set("a.b.c.d",{ "key" : "value" });

		return s.get("a.b.c.d").then((val)=>{		

			assert.deepEqual(val,{ "key" : "value" });
			return Promise.resolve();
		});
	});

	it("set() accepts function as value",()=>{

		let s=new Ses();
		s.set("a.b.c.d",()=>({ "key" : "value" }));

		return s.get("a.b.c.d").then((val)=>{		

			assert.deepEqual(val,{ "key" : "value" });
			return Promise.resolve();
		});
	});

	it("Get invalid value returns undefined",()=>{

		let s=new Ses();
		return s.get("a.b.c.d").then((val)=>{

			assert(val===undefined);
			return Promise.resolve();
		});
	});

});


describe("Multiplexed stores",()=>{

	var s=new Ses();
	var a=new Ses();
	var b=new Ses();

	s.attach("a",a);
	s.attach("b",b);

	s.transmit((msg, store)=>store.receive(msg));
	a.transmit((msg)=>s.receive(msg, a));
	b.transmit((msg)=>s.receive(msg, b));

	it("Remote set into child store", ()=>{

		s.set("a.system.voltage",33);
		return a.get("system.voltage").then((val)=>{

			assert.equal(val, 33);
			return Promise.resolve();
		});
	});

	it("Remote get from child store", ()=>{

		b.set("system.speed",45);
		return s.get("b.system.speed").then((val)=>{

			assert.equal(val, 45);
			return Promise.resolve();
		});

	});

	it("Get invalid child value returns undefined", ()=>{

		return s.get("a.system.speed").then((val)=>{

			assert.equal(val, undefined);
			return Promise.resolve();
		});

	});

});



describe("Events",()=>{

	var s=new Ses();
	var a=new Ses();

	s.attach("a",a);

	s.transmit((msg, store)=>store.receive(msg, s));
	a.transmit((msg)=>s.receive(msg, a));

	it("Subscribe to child event (exact)", (done)=>{

		s.subscribe("a.system.voltage",(path, val)=>{

			assert.equal(path,"a.system.voltage");
			assert.equal(val, 21);
			done();
		});

		a.set("system.voltage",21);
	});


	it("Subscribe to child event (inferred)", (done)=>{

		s.subscribe("a.flowers.roses",(path, val)=>{

			assert.equal(path, "a.flowers");
			assert.deepEqual(val, {"roses": [1,2,3]});
			done();
		});

		a.set("flowers",{"roses": [1,2,3]});
	});

});

// Make sure incoming values request store doesn't build up 
// Add unsubscribe, unattach (plus tests)
// Document
// Push to NPM




