#include <cassert>
#include "Datastore.h"

using namespace entangld;

/** Remote 'set' test - set and retrieve remote value. */
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

    store_a->set("store_b.name", {
        {"first", "Bruce"},
        {"middle", nullptr},
        {"last", "Wayne"}
    });

    store_b->set("store_a.name", {
        {"first", "Alfred"},
        {"middle", "Thaddeus Crane"},
        {"last", "Pennyworth"}
    });

    store_a->get("name.first", [](const Message &msg, void*){
        assert(msg.value == "Alfred");
    });

    store_b->get("name.first", [](const Message &msg, void*){
        assert(msg.value == "Bruce");
    });

    delete store_a;
    delete store_b;

    return EXIT_SUCCESS;
}
