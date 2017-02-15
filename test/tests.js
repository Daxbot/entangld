var Entangld=require("../index.js");
var assert=require("assert");


describe("Local storage",()=>{

	it("Set/get value",()=>{

		let s=new Entangld();
		s.set("a.b.c.d",{ "key" : "value" });

		return s.get("a.b.c.d").then((val)=>{		

			assert.deepEqual(val,{ "key" : "value" });
			return Promise.resolve();
		});
	});

	it("set() accepts function (RPC mode)",()=>{

		let s=new Entangld();

		// Assign a function to "a.b.c.d"
		s.set("a.b.c.d",(params)=>({ "doubled" : 2*params.value }));

		return s.get("a.b.c.d", {"value": 5}).then((val)=>{		

			assert.deepEqual(val,{ "doubled" : 10 });
			return Promise.resolve();
		});
	});

	it("Get invalid value returns undefined",()=>{

		let s=new Entangld();
		return s.get("a.b.c.d").then((val)=>{

			assert(val===undefined);
			return Promise.resolve();
		});
	});

});


describe("Multiplexed stores",()=>{

	var s=new Entangld();
	var a=new Entangld();
	var b=new Entangld();

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

	it("Child read from parent", ()=>{

		b.attach("__parent", s);
		s.set("eyes", "blue");

		return b.get("__parent.eyes").then((val)=>{

			assert.equal(val, "blue");
			return Promise.resolve;
		});

	});

	it("Child read from sibling", ()=>{

		a.set("system.tea","Earl Grey. Hot.");
		return b.get("__parent.a.system.tea").then((val)=>{

			assert.equal(val, "Earl Grey. Hot.");
			return Promise.resolve;
		});

	});
	it(".namespaces getter", ()=>{

		assert.deepEqual(s.namespaces,["a","b"]);
	});	

	it(".detach() by namespace", ()=>{

		assert.equal(s.detach("a"), true);
		assert.deepEqual(s.namespaces,["b"]);
	});	

	it(".detach() by store", ()=>{

		assert.equal(s.detach(null, b), true);
		assert.deepEqual(s.namespaces,[]);
	});	

	// Add a triple multiplexed store test
	// Then go consider using it with DaxOS chips


});



describe("Events",()=>{

	var s=new Entangld();
	var a=new Entangld();

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





