cmake_minimum_required(VERSION 3.5)

add_executable(init test_init.cpp)
target_include_directories(init PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(init entangld)
add_test("init" init)
