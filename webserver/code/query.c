#include <stdio.h>
#include <signal.h>
#include <stddef.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>

#include "imageaccess.h"
#include "query.h"

//#define BUFFER_SIZE 512
static int
ConnectToImageServer(char *imageName)
{
  /*
   * Look up the address of the server.
   */
  struct sockaddr_in inaddr;
  int err = ImageAccess_Lookup(imageName, &inaddr);
  if (err < 0) {
    return -1;
  }

  /*
   * Create a socket and establish a TCP connection with the server.
   */
  int sockfd = socket(AF_INET, SOCK_STREAM, 0);
  if (sockfd < 0)  {
    perror("opening socket");
    return -1;
  }

  err = connect(sockfd,(struct sockaddr *) &inaddr,sizeof(inaddr));
  if (err < 0) {
    perror("connect");
    close(sockfd);
    return -1;
  }

  return sockfd;
}

int
Query_WordLookup(char *imageName, void *word, char **result)
{
  int sockfd = ConnectToImageServer(imageName);
  if (sockfd < 0) {
    return -1;
  }
  /*
   * We now have an open TCP connection to the server.
   * Send query and get response.
   */

  /* Write the query */
  // Get the length of the query 
  int length;
  memcpy(&length,word,sizeof(int));
  
  // Send the query message
  int totalBytesWritten = 0;
  while(totalBytesWritten < sizeof(int)){
    char *buff = word + totalBytesWritten;
    int bytesToWrite = length + sizeof(int) - totalBytesWritten;
    int nbytes = write(sockfd,buff,bytesToWrite);
    if(nbytes < 0){
      perror("write");
      return -1;
    }
    totalBytesWritten += nbytes;
  }

  /* Read the response */
  
  // Read the length of the response
  char responseLength[sizeof(int)];
  unsigned int totalBytesRead = 0;
  while(totalBytesRead < sizeof(int)){
    char * buff = responseLength + totalBytesRead;
    unsigned int bytesToRead = sizeof(int) - totalBytesRead;
    int nbytes = read(sockfd,buff,bytesToRead);
    if(nbytes < 0){
      perror("read");
      return -1;
    }
    totalBytesRead += nbytes;
  }
  
  // Get the response length as an integer
  int len;
  memcpy(&len,responseLength,sizeof(int));
  
  // Read the response
  char *response = malloc(len+1);
  totalBytesRead = 0;
  while(totalBytesRead < len){
    char *buff = response + totalBytesRead;
    int bytesToRead = len - totalBytesRead;
    int nbytes = read(sockfd,buff,bytesToRead);
    if(nbytes < 0)return -1;
    totalBytesRead += nbytes;
  }
  close(sockfd);
  // Append the null terminator
  response[len] = 0; 
 
  *result = response;
  return totalBytesRead;
}
