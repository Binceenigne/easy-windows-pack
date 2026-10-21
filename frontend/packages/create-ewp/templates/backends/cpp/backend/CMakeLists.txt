cmake_minimum_required(VERSION 3.24)
project(ewp_host LANGUAGES C CXX)
if(NOT WIN32)
  message(FATAL_ERROR "ewp-host requires Windows and Microsoft Edge WebView2 Runtime")
endif()
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_CONFIGURATION_TYPES AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
include(FetchContent)
set(WEBVIEW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_SHARED_LIBRARY OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_STATIC_LIBRARY ON CACHE BOOL "" FORCE)
set(WEBVIEW_INSTALL_TARGETS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_MSWEBVIEW2_VERSION "1.0.1150.38" CACHE STRING "" FORCE)
FetchContent_Declare(webview
  GIT_REPOSITORY https://github.com/webview/webview.git
  GIT_TAG 0.12.0
  GIT_SHALLOW TRUE)
set(JSON_BuildTests OFF CACHE BOOL "" FORCE)
FetchContent_Declare(nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
  GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(webview nlohmann_json)
add_executable(ewp-host WIN32 src/main.cpp)
target_compile_definitions(ewp-host PRIVATE NOMINMAX UNICODE _UNICODE)
target_link_libraries(ewp-host PRIVATE webview::core_static nlohmann_json::nlohmann_json comctl32 winhttp shell32)
set_target_properties(ewp-host PROPERTIES
  OUTPUT_NAME "ewp-host"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/$<0:>")
if(MSVC)
  target_compile_options(ewp-host PRIVATE /W4 /utf-8 /EHsc)
elseif(MINGW)
  target_link_options(ewp-host PRIVATE -static -static-libgcc -static-libstdc++)
endif()