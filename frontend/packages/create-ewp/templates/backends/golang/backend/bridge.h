#pragma once
#include <stdlib.h>

#ifdef __cplusplus
extern "C" {
#endif
typedef void *ewp_host;
// These values mirror ewp::Command in ewp_host.hpp.
enum ewp_command {
  EWP_STATE, EWP_MINIMIZE, EWP_MAXIMIZE, EWP_RESTORE, EWP_CLOSE,
  EWP_DRAG, EWP_TOPMOST, EWP_RESIZE, EWP_HIDE, EWP_SHOW, EWP_MODE
};
ewp_host ewp_create(char **error);
void ewp_destroy(ewp_host host);
char *ewp_start(ewp_host host);
char *ewp_command_run(ewp_host host, int command, int a, int b);
void ewp_reply(ewp_host host, const char *id, const char *result);
void ewp_show_error(const char *message);
#ifdef __cplusplus
}
#endif