#include <cassert>
#include "Datastore.h"

using namespace entangld;

/** Remote 'get' test - access remote values assigned in constructor. */
int main()
{
    Datastore *store_a = new Datastore({
        {"name", "Alfred"},
        {"occupation", "Butler"}
    });

    Datastore *store_b = new Datastore({
        {"name", "Bruce"},
        {"occupation", "Batman"},
    });

    // Attach store_b to store_a
    store_a->attach(
        "store_b",
        [](const Message &msg, void *ctx) {
            Datastore *store_b = static_cast<Datastore*>(ctx);
            store_b->receive(msg, "store_a");
        },
        store_b
    );

    // Attach store_a to store_b
    store_b->attach(
        "store_a",
        [](const Message &msg, void *ctx) {
            Datastore *store_a = static_cast<Datastore*>(ctx);
            store_a->receive(msg, "store_b");
        },
        store_a
    );

    // Get "store_b.name" should return "Bruce"
    store_a->get("store_b.name", [](const Message &msg, void*){
        assert(msg.value == "Bruce");
    });

    // Get "store_b.occupation" should return "Batman"
    store_a->get("store_b.occupation", [](const Message &msg, void*){
        assert(msg.value == "Batman");
    });

    // Get "store_a.name" should return "Alfred"
    store_b->get("store_a.name", [](const Message &msg, void*){
        assert(msg.value == "Alfred");
    });

    // Get "store_a.occupation" should return "Butler"
    store_b->get("store_a.occupation", [](const Message &msg, void*){
        assert(msg.value == "Butler");
    });

    // Get "badkey" should return null
    store_a->get("badkey", [](const Message &msg, void*){
        assert(msg.value == nullptr);
    });

    delete store_a;
    delete store_b;

    return EXIT_SUCCESS;
}
