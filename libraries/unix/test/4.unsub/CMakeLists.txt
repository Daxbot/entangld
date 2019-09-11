cmake_minimum_required(VERSION 3.5)

add_executable(basic_unsubscribe test_unsub_basic.cpp)
target_include_directories(basic_unsubscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(basic_unsubscribe entangld)
add_test("basic_unsubscribe" basic_unsubscribe)

add_executable(remote_unsubscribe test_unsub_remote.cpp)
target_include_directories(remote_unsubscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_unsubscribe entangld)
add_test("remote_unsubscribe" remote_unsubscribe)
