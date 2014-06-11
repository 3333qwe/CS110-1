#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <unistd.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#include <signal.h>
#include "imageaccess.h"

extern char *imgFileNames[MAX_IMAGESERVERS];
extern int numImgFiles;
