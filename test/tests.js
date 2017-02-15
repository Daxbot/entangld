var Entangld=require("../index.js");
var assert=require("assert");


describe("Internal functions",()=>{

	let e=new Entangld();

	describe("_partial_copy",()=>{

		// Create a data tree
		let v={

			a: {
				b: {
					c: 6
				}
			},
			d: {
				e: [
					{
						f: { 
							g: 7
						}
					}
				]
				
			},
			h: 4
		};

		it("returns original object when depth is unspecified",()=>{

			assert.deepEqual(e._partial_copy(v), v);

		});

		it("max_depth==0",()=>{

			assert.deepEqual(e._partial_copy(v,0), {a: {}, d:{}, h:4});

		});

		it("max_depth==1",()=>{

			assert.deepEqual(e._partial_copy(v,1), {a: { b: {} }, d:{ e: [] }, h:4});

		});

		it("max_depth==2",()=>{

			assert.deepEqual(e._partial_copy(v,2), {a: { b: { c: 6 } }, d:{ e: [ {} ] }, h:4 });

		});

		it("max_depth==3",()=>{

			assert.deepEqual(e._partial_copy(v,3), {a: { b: { c: 6 } }, d:{ e: [ { f: {} } ] }, h:4 });

		});

		it("max_depth==4",()=>{

			assert.deepEqual(e._partial_copy(v,4), {a: { b: { c: 6 } }, d:{ e: [ { f: { g: 7 } } ] }, h:4 });

		});
	});

});




describe("Local storage",()=>{

	it("Set/get value",()=>{

		let s=new Entangld();
		s.set("a.b.c.d",{ "key" : "value" });

		return s.get("a.b.c.d").then((val)=>{		

			assert.deepEqual(val,{ "key" : "value" });
			return Promise.resolve();
		});
	});

	it("set() accepts function (RPC mode, object as parameter)",()=>{

		let s=new Entangld();

		// Assign a function to "a.b.c.d"
		s.set("a.b.c.d",(params)=>({ "doubled" : 2*params.value }));

		return s.get("a.b.c.d", {"value": 5}).then((val)=>{		

			assert.deepEqual(val,{ "doubled" : 10 });
			return Promise.resolve();
		});
	});

	it("set() accepts function (RPC mode, bare value as parameter)",()=>{

		let s=new Entangld();

		// Assign a function to "a.b.c.d"
		s.set("a.b.c.d",(param)=>( 2*param));

		return s.get("a.b.c.d", 5).then((val)=>{		

			assert.equal(val,10);
			return Promise.resolve();
		});
	});

	it("get() accepts optional max_depth parameter",()=>{

		let s=new Entangld();

		// Create a data tree
		let tree={

			a: {
				b: {
					c: 6
				}
			},
			d: {
				e: {
					f: 7
				}
			}
		};

		// Assign tree
		s.set("tree",tree);

		return s.get("tree").then((val)=>{		

			// Make sure we get the whole tree
			assert.deepEqual(val,tree);

			return s.get("tree",0);
		})
		.then((val)=>{

			// Make sure we get the first layer (depth 0)
			assert.deepEqual(val,{a:{}, d:{}});

			return s.get("tree",1);
		})
		.then((val)=>{

			// Make sure we get the first and second layers (depth 1)
			assert.deepEqual(val,{a:{ b: {} }, d:{ e: {} }});
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

	it("Remote get from child RPC (bare value as parameter)", ()=>{

		b.set("system.doubled",(param)=>param*2);
		return s.get("b.system.doubled", 15).then((val)=>{

			assert.equal(val, 30);
			return Promise.resolve();
		});

	});

	it("Remote get from child RPC (object as parameter)", ()=>{

		a.set("system.doubled",(param)=>({ doubled: param.value*2}));
		return s.get("a.system.doubled", {value: 4}).then((val)=>{

			assert.deepEqual(val, {doubled: 8});
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





