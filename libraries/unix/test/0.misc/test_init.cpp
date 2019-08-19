#include <cassert>
#include "Datastore.h"

using namespace entangld;

/** Init test. */
int main()
{
    Datastore *store = nullptr;

    // Default constructor
    store = new Datastore;
    assert(store);
    delete store;

    // JSON constructor
    store = new Datastore({
        {"a", 1},
        {"b", 2},
        {"c", 3},
    });
    assert(store);
    delete store;

    return EXIT_SUCCESS;
}