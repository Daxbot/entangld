var Ses=require("../index.js");
var assert=require("assert");


describe("Local storage",()=>{

	it("Set/get value",(done)=>{

		let s=new Ses();
		s.set("a.b.c.d",{ "key" : "value" });

		s.get("a.b.c.d").then((val)=>{		

			assert.deepEqual(val,{ "key" : "value" });
			done();
		});
	});


	it("Get invalid value returns undefined",(done)=>{

		let s=new Ses();
		s.get("a.b.c.d").then((val)=>{

			assert(val===undefined);
			done();
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
	a.transmit((msg)=>s.receive(msg));
	b.transmit((msg)=>s.receive(msg));

	it("Remote set into child store", (done)=>{

		s.set("a.system.voltage",33);
		a.get("system.voltage").then((val)=>{

			assert.equal(val, 33);
			done();
		});
	});

	it("Remote get from child store", (done)=>{

		b.set("system.speed",45);
		s.get("b.system.speed").then((val)=>{

			assert.equal(val, 45);
			done();
		});

	});

	// Also do tests where set sets a getter function

	// Also do tests where setting a child bubbles events to the parent

});







