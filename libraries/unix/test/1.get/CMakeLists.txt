cmake_minimum_required(VERSION 3.5)

add_executable(basic_get test_get_basic.cpp)
target_include_directories(basic_get PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(basic_get entangld)
add_test("basic_get" basic_get)

add_executable(nested_get test_get_nested.cpp)
target_include_directories(nested_get PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(nested_get entangld)
add_test("nested_get" nested_get)

add_executable(remote_get test_get_remote.cpp)
target_include_directories(remote_get PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_get entangld)
add_test("remote_get" remote_get)
