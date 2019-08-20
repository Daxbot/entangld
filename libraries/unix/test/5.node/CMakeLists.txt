cmake_minimum_required(VERSION 3.5)

# Node tests depend on sample binaries
if(ENTANGLD_BUILD_SAMPLES)
    find_program(NODEJS NAMES node)
    if(NODEJS)
        configure_file(test_get.js.in test_get.js @ONLY)
        add_test(
            NAME "node_get"
            COMMAND ${NODEJS} test_get.js
        )

        configure_file(test_set.js.in test_set.js @ONLY)
        add_test(
            NAME "node_set"
            COMMAND ${NODEJS} test_set.js
        )

        configure_file(test_sub.js.in test_sub.js @ONLY)
        add_test(
            NAME "node_subscribe"
            COMMAND ${NODEJS} test_sub.js
        )
    endif()
endif()
