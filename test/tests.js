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
	
	describe("_dereferenced_copy",()=>{

		let o={

			"data" : { 
				"some" : "data",
				"more_data" : {

					"more" : "data",
					"func" : function(){ return "sasquatch!"; },
					"promise" : function() { return new Promise((resolve)=>{  resolve("tomatoes"); }); }
				}
			}

		};

		it("convert embedded functions to values",()=>{

			return e._dereferenced_copy(o).then((val)=>{

				assert.deepEqual(val, 
					{

					"data" : { 
						"some" : "data",
						"more_data" : {

							"more" : "data",
							"func" : "sasquatch!",
							"promise" : "tomatoes"
							}
						}
					}
				);

				return Promise.resolve;
			});

		});

		it("undefined passes through",()=>{

			return e._dereferenced_copy(undefined).then((val)=>{

				assert.equal(val, undefined);
				return Promise.resolve;
			});
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

	it(".push()",()=>{

		let s=new Entangld();
		s.set("arr",[]);

		s.push("arr",1);
		s.push("arr",2);

		return s.get("arr").then((val)=>{		

			assert.equal(val.length,2);
			return Promise.resolve();
		});
	});

	it(".push() to non-array throws error",(done)=>{

		let s=new Entangld();
		s.set("arr",2);		// It's a number, not an array

		try {
			
			s.push("arr",1);

		} catch(e) {

			assert.equal(e.message, "You cannon .push() to that object");
			done();
		}

	});

	it("Set/get trivial value",()=>{

		let s=new Entangld();
		s.set("temperature",33);

		return s.get("temperature").then((val)=>{		

			assert.equal(val,33);
			return Promise.resolve();
		});
	});

	it("Set entire tree at empty path",()=>{

		let s=new Entangld();
		s.set("",{ "key" : "value" });

		return s.get("key").then((val)=>{		

			assert.deepEqual(val,"value");
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

	it("get() subpath below function returns properly",()=>{

		let s=new Entangld();

		// Assign a function to "a.b.c.d"
		s.set("a.b.c.d",()=>{ return { "sub" : "path" }; });

		return s.get("a.b.c.d.sub").then((val)=>{		

			assert.equal(val,"path");
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

	it("Get invalid path returns undefined",()=>{

		let s=new Entangld();
		return s.get("a.b.c.d").then((val)=>{

			assert(val===undefined);
			return Promise.resolve();
		});
	});

	it("get() invalid path below function returns undefined",()=>{

		let s=new Entangld();

		// Assign a function to "a.b.c.d"
		s.set("a.b.c.d",()=>{ return { "sub" : "path" }; });

		return s.get("a.b.c.d.doesnotexist").then((val)=>{		

			assert(val===undefined);
			return Promise.resolve();
		});
	});
});


describe("Multiplexed stores",()=>{

	var s=new Entangld();
	var a=new Entangld();
	var b=new Entangld();
	var c=new Entangld();	// attached later

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

		a.set("system.speed",45);
		return s.get("a.system.speed").then((val)=>{

			assert.equal(val, 45);
			return Promise.resolve();
		});

	});

	it("Remote set single root value into child store", ()=>{

		s.set("b.something",99);
		return b.get("something").then((val)=>{

			assert.equal(val, 99);
			return Promise.resolve();
		});
	});

	it("null is an allowed value", ()=>{

		b.set("system.n_ull",null);
		return s.get("b.system.n_ull").then((val)=>{

			assert.equal(val, null);
			return Promise.resolve();
		});
	});


	it("Remote get root (everything) from child store", ()=>{

		return s.get("a").then((val)=>{

			assert.deepEqual(val,{system: {voltage: 33, speed: 45}});
			return Promise.resolve();
		});

	});

	it("Remote get from child setter (bare value as parameter)", ()=>{

		b.set("system.doubled",(param=1)=>param*2);
		return s.get("b.system.doubled", 15).then((val)=>{

			assert.equal(val, 30);
			return Promise.resolve();
		});
	});

	it("Remote get from child setter (object as parameter)", ()=>{

		a.set("system.doubled",(param=1)=>({ doubled: param.value*2}));
		return s.get("a.system.doubled", {value: 4}).then((val)=>{

			assert.deepEqual(val, {doubled: 8});
			return Promise.resolve();
		});
	});


	it("Remote push to attached child", ()=>{

		s.set("a.arr",[]);
		s.push("a.arr",1);
		return s.get("a.arr").then((val)=>{

			assert.equal(val.length, 1);
			return Promise.resolve();
		});
	});

	it("Setter visible in _deref_mode", ()=>{

		b.set("system.five",()=>5);
		b._deref_mode=true;
		return s.get("b.system").then((val)=>{

			assert.deepEqual(val, { n_ull: null, doubled: 2, five: 5 });
			b._deref_mode=false;
			return Promise.resolve();
		});

	});


	it("Get invalid child value returns undefined", ()=>{

		return s.get("b.system.speed").then((val)=>{

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

	it("non-root child store", ()=>{

		 // Set up store C (declared earlier)
		 c.transmit((msg)=>s.receive(msg, c));
		 c.set("val",33);

		 // Attach c to s at s.more_stores.c
		 s.set("more_stores",{"title": "store C is located at this level", "c": null});
		 s.attach("more_stores.c",c);

		 return s.get("more_stores.c.val").then((val)=>{

		     assert.equal(val, 33);
		     return Promise.resolve();
		 });
	});

	it("Remote set into non root child store", ()=>{

		s.set("more_stores.c.system.voltage",33);
		return c.get("system.voltage").then((val)=>{

			assert.equal(val, 33);
			return Promise.resolve();
		});
	});

	it("Remote get from non root child store", ()=>{

		c.set("system.speed",45);
		return s.get("more_stores.c.system.speed").then((val)=>{

			assert.equal(val, 45);
			return Promise.resolve();
		});

	});

	it("Parent .get() shows attached child namespaces as empty objects", ()=>{

		return s.get("").then((val)=>{

			assert.deepEqual(val, 

		      {
		        eyes: "blue",
		        more_stores: {
		          c: {},
		          title: "store C is located at this level"
		        }
		      });

			return Promise.resolve();
		});

	});

	it("set() on parent of attached store throws Error", ()=>{

		return new Promise((resolve)=>{

			try{

				s.set("more_stores",{});

			} catch(e) {

				assert(e.message.match(/would overwrite/));
				resolve();
			}
		});


	});


	it("detaching child namespace causes its name to disappear from the tree", ()=>{

		s.detach(null,c);
		return s.get("").then((val)=>{

			assert.deepEqual(val, 

		      {
		        eyes: "blue",
		        more_stores: {
		          title: "store C is located at this level"
		        }
		      });

			return Promise.resolve();
		});

	});


	// Add a triple multiplexed store test



});







