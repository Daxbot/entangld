cmake_minimum_required(VERSION 3.5)

add_executable(server server.cpp debug.c)
target_include_directories(server PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(server entangld)

add_executable(client client.cpp debug.c)
target_include_directories(client PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(client entangld)

