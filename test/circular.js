let Entangld = require("../index.js").Datastore;

function wait (ms) {
    return new Promise(res=>setTimeout(res,ms));
}

describe("Circular References", function() {
    let s,a,b;

    beforeEach(function() {
        s = new Entangld();
        a = new Entangld();
        b = new Entangld();

        s.attach("path1.A",a);
        s.attach("path2.B",b);
        a.attach("path3.B",b);
        b.attach("path4.A",a);

        s.transmit((msg, store)=>store.receive(msg, s));
        a.transmit((msg, store)=>store.receive(msg, a));
        b.transmit((msg, store)=>store.receive(msg, b));
    });

    afterEach(function() {
        delete s;
        delete a;
        delete b;
    });

    it("Circular subscriptions don't break", function(done) {
        s.subscribe("path1.A.path3.B.path4.A.data", () => {
            done();
        });
        a.set("data",1);
    });
});
