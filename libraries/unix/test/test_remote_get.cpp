#include <cassert>
#include "Datastore.h"

using namespace entangld;

int main(int argc, char *argv[])
{
    Datastore *store_a = new Datastore({
        {"name", "Alfred"},
        {"occupation", "Butler"}
    });

    Datastore *store_b = new Datastore({
        {"name", "Bruce"},
        {"occupation", "Batman"},
    });

    store_a->attach(
        "store_b",
        [](const Message &msg, void *ctx) {
            Datastore *store_b = static_cast<Datastore*>(ctx);
            store_b->receive(msg, "store_a");
        },
        store_b
    );

    store_b->attach(
        "store_a",
        [](const Message &msg, void *ctx) {
            Datastore *store_a = static_cast<Datastore*>(ctx);
            store_a->receive(msg, "store_b");
        },
        store_a
    );

    store_a->get("store_b.name", [](const Message &msg, void*){
        assert(msg.value == "Bruce");
    });

    store_a->get("store_b.occupation", [](const Message &msg, void*){
        assert(msg.value == "Batman");
    });

    store_b->get("store_a.name", [](const Message &msg, void*){
        assert(msg.value == "Alfred");
    });

    store_b->get("store_a.occupation", [](const Message &msg, void*){
        assert(msg.value == "Butler");
    });

    delete store_a;
    delete store_b;

    return EXIT_SUCCESS;
}
