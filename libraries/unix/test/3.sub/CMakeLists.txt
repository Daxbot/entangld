cmake_minimum_required(VERSION 3.5)

add_executable(basic_subscribe test_sub_basic.cpp)
target_include_directories(basic_subscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(basic_subscribe entangld)
add_test("basic_subscribe" basic_subscribe)

add_executable(remote_subscribe test_sub_remote.cpp)
target_include_directories(remote_subscribe PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(remote_subscribe entangld)
add_test("remote_subscribe" remote_subscribe)
