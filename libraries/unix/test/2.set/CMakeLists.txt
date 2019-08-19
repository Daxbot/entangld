cmake_minimum_required(VERSION 3.5)

add_executable(basic_set test_set_basic.cpp)
target_include_directories(basic_set PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(basic_set entangld)
add_test("basic_set" basic_set)

add_executable(nested_set test_set_nested.cpp)
target_include_directories(nested_set PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(nested_set entangld)
add_test("nested_set" nested_set)

add_executable(remote_set test_set_remote.cpp)
target_include_directories(remote_set PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_set entangld)
add_test("remote_set" remote_set)
