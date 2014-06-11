#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdbool.h>

#include "debug.h"

#include "http.h"
#include "query.h"
#include "webserver.h"

/*
 * Process a HTTP protocol connection.
 */

static int HttpReadLine(int sock, char *linebuffer, int maxsize);
static int HttpReadNBytes(int sock, char *buffer, int nbytes);
static int HttpWriteLine(int sock, char *linebuffer, int size);
static int SendHtmlReply(int connfd, char *status, char *html);
static int SendTextReply(int connfd, char *status, char *text);

int sendHttp = 1;

/*
 * Parse the path to get the query value
 */
void * ParseQuery(char *path){
  char token[] = "query";
  char delim[] = "&";
  // Find the first occurrence of "query in path";
  char *str = strstr(path,token);
  // Find the delimiting character "&"
  char *delimeter = strstr(path,delim);
  // return NULL on no query (str == NULL) or bad query (delim == NULL)
  if(str == NULL || delimeter == NULL)return NULL;
  
  
  // Str points to 'q' in query, advance it by the lenght of "query" plus
  // the '='
  str += strlen(token) + 1;
  
  // The query value is then what's between str and the delim
  int length = delimeter - str;

  // Copy the word into a temp
  char temp[length + 1];
  strncpy(temp,str,length);
  temp[length] = 0;

  // The buffer will hold the length of the string followed by the string
  void *buffer = malloc(length+1+sizeof(int));
  
  // Copy the length into the buffer
  memcpy(buffer,&length,sizeof(int));
  // Copy the string into the buffer
  memcpy(buffer+sizeof(int),temp,length+1);

  return buffer;
}

/*
 * Parse the path to get the disk value
 */
char * ParseDisk(char *path){
  char token[] = "disk";
  char *str = strstr(path,token);
  if(str == NULL)return NULL;
  // Advance str by the length of disk and the "="
  str += strlen(token) + 1;
  return strdup(str);
}

char *replyMessage(){
  char *beginning = 
    "<html>\n"
    "<h1>Welcome! What are you querying for?</h1>\n"
    "<body>\n"
    
    // Form for the query input max length is 33 (32 chars plus null
    "<form name=\"input\" action=\"/\" method=\"get\">\n"
    "Query: <input type=\"text\" name=\"query\" maxlength=\"32\"><br>\n";
  char *end = 
    "<input type=\"submit\" value=\"Submit\">\n"
    "</form>\n"
    "Attempt to query file %s for word %s returns:\n %s\n"
    "</body>\n"
    "</html>";
  char *radioButton = "<input type=\"radio\" name=\"disk\" value=\"%s\">%s<br>\n";
  // Create a buffer to hold the entire get message
  int totalLength = strlen(beginning) + strlen(end);
  int radioLength = strlen(radioButton);
  for (int i = 0; i <numImgFiles; i++){
    totalLength += strlen( imgFileNames[i]);
    totalLength += radioLength;
  }
  char buffer[totalLength];
  // Copy the beggining into it
  strcpy(buffer,beginning);
  // copy the forms for the radio buttons for disk
  for (int i = 0; i < numImgFiles; i++){
    char buf1[ strlen(radioButton) + strlen( imgFileNames[i]) + 1 ];
    // Insert the imgfilename into the text for the radio button;
    int success = sprintf(buf1,radioButton,imgFileNames[i],imgFileNames[i]);
    if(success < 0) return NULL;
    strcat(buffer,buf1);
  }
  // Copy the end into it
  strcat(buffer,end);
  return strdup(buffer);
}


/*
 * Process an HTTP GET request.
 */
static void
HandleGetRequest(int connfd, char *path, char *version)
{
  char *replyMessageFormat = replyMessage();
  
  /*
   * Make this a little more of a test by attempting to send a query to the
   * backend.  Note that qresult size assumes the diskresult is going to be
   * small. You will want to change this.
   */

  // Query includes a header with its length
  void *query =  ParseQuery(path);
  char *disk = ParseDisk(path);

  if(query != NULL && disk != NULL){
    int size;
    memcpy(&size,query,sizeof(int));

    char *qresult = NULL;

    int nbytes = Query_WordLookup(disk,query, &qresult);
    if (nbytes < 0) {
      sprintf(qresult, "ERROR\n");
      // Append the null terminator
    } else {
      qresult[nbytes] = 0;
    }
    char buffer[strlen(replyMessageFormat) + strlen(path) +
		strlen(version) + strlen(qresult) + 10];
    sprintf(buffer, replyMessageFormat,disk,(char *)query
    + 4,qresult);
    
    if (sendHttp) {
      SendHtmlReply(connfd, "HTTP/1.0 200 OK", buffer);
    } else {
      /* This is mainly here to stop compiler from complaining about
       * SendTextReply never called. */
      SendTextReply(connfd, "HTTP/1.0 200 OK", buffer);
    }
    free(qresult);
  }else{
    char disk[] = "No disk selected";
    char query[] = "No query";
    char qresult[] = "No query done";
    char buffer[strlen(replyMessageFormat) + strlen(path) +
		strlen(version) + strlen(qresult) + 10];
    sprintf(buffer, replyMessageFormat, disk,query, qresult); 
    if (sendHttp) {
      SendHtmlReply(connfd, "HTTP/1.0 200 OK", buffer);
    } else {
      /* This is mainly here to stop compiler from complaining about
       * SendTextReply never called. */
      SendTextReply(connfd, "HTTP/1.0 200 OK", buffer);
    }
  }
  // Free the strings that were malloc'd
  free(replyMessageFormat);
  free(query);
  free(disk);
}

/*
 * Process an HTTP POST request.
 */
static void
HandlePostRequest(int connfd, char *path, char *version, char *contents)
{
  char *replyMessageFormat =
    "<html>\n"
    "<body>\n"
    "<h2>Got a POST request</h2>\n"
    "<h3>Path argument was: %s</h3>\n"
    "<h3>Version was: HTTP/%s</h3>\n"
    "<h3>Contents was: %s</h3>\n"
    "</body>\n"
    "</html>";

  char buffer[strlen(replyMessageFormat) + strlen(path) +
              strlen(version) + strlen(contents) + 10];
  sprintf(buffer, replyMessageFormat, path, version, contents);

  SendHtmlReply(connfd, "HTTP/1.0 200 OK", buffer);
}

/*
 * Process a HTTP connection.
 */
int
Http_ProcessConnection(int connfd)
{
  /*
   * The first line should the HTTP request command.
   */
  char requestString[4096];
  int len = HttpReadLine(connfd, requestString, sizeof(requestString));
  if (len < 0)
    return -1;

  DPRINTF('h', ("Got HTTP request \"%s\"\n", requestString));

  /*
   * Process the headers until we get a blank line.  Currently the only header
   * we care about is the Content length header.
   */
  int contentLength = 0;
  do {
    char line[4096];
    len = HttpReadLine(connfd, line, sizeof(line));
    if (len < 0) break;

    DPRINTF('h',("Header Line:\"%s\"\n",line));

    int clen;
    int n = sscanf(line, "Content-Length: %d", &clen);
    if (n == 1) {
      contentLength = clen;
      DPRINTF('h',("Found length of %d\n", clen));
    }
  } while (len > 0);  /* A blank line has len==0. */

  char *contents = NULL;
  if (contentLength > 0) {
    contents = malloc(contentLength+1);

    /* Read the contents of the request. */
    HttpReadNBytes(connfd, contents, contentLength);
    contents[contentLength] = 0;
    DPRINTF('h',("Read request bytes %s\n",contents));
  }

  /* We got a request; now handle it. */
  char path[sizeof(requestString)];
  char version[sizeof(requestString)];

  /* Check to see if its a GET request. */
  int n = sscanf(requestString, "GET %s HTTP/%s", path, version);
  if (n == 2) {
    DPRINTF('h',("Found GET request of path %s and version %s\n", path, version));
    HandleGetRequest(connfd, path, version);
  }
  else {
    n = sscanf(requestString, "POST %s HTTP/%s", path, version);
    if  (n == 2) {
      DPRINTF('h',("Found POST request of path %s and version %s\n", path, version));
      HandlePostRequest(connfd, path, version, contents);
    }
    else {
      DPRINTF('h',("Unknown request\n"));
      char ebuffer[strlen(requestString)+200];
      sprintf(ebuffer, "<html>\n<h1>Error</h1>\n<body>\n%s\n</body><html>\n", requestString);
      SendHtmlReply(connfd, "HTTP/1.0 501 Not Implemented", ebuffer);
    }
  }

  free(contents);
  close(connfd);
  return 0;
}


/*
 * Write a HTTP protocol line the specifed socket. Return -1 on error.
 */
static int
HttpWriteLine(int sock, char *linebuffer, int size)
{
    size += strlen("\r\n");

    char outbuffer[size + 1];

    snprintf(outbuffer, sizeof(outbuffer), "%s\r\n", linebuffer);
    linebuffer = outbuffer;

    while (size > 0) {
        int bytes =  write(sock, linebuffer, size);
        
        if (bytes < 0) {
            perror("write");
            return -1;
        }
        
        size -= bytes;
        linebuffer += bytes;
    }

    return 0;
}


/*
 * Read a HTTP protocol line the specifed sock. Return -1 on error, otherwise
 * number of bytes in the line.
 * Read and discard if line is longer than buffer.
 */
static int
HttpReadLine(int sock, char *linebuffer, int maxsize)
{
  char lastch = -1;
  int retval = 1;

  int pos;
  for (pos = 0; true; pos++) {
    char ch;
    retval = read(sock, &ch, 1);
    if (retval < 0) {
      perror("read");
      break;
    }
    if (retval == 0) {
      break;
    }
    if ((ch == '\n') && (lastch == '\r')) {
      pos--;  // Strip \r from buffer;
      break;
    }
    if (pos < maxsize-1) {
      linebuffer[pos] = ch;
    }
    lastch = ch;
  }

  linebuffer[pos] = 0;

  return (retval != 1) ? -1 : pos;
}

/*
 * Read n bytes from the socket. Return -1 on error, n otherwise.
 */
static int
HttpReadNBytes(int sock, char *buffer, int n)
{
  for (int pos = 0; pos < n; pos++) {
    int retval = read(sock, buffer + pos, 1);
    if (retval < 0) {
      perror("readr");
      return -1;
    }
  }
  return n;
}


/*
 * Send an HTTP reply back to the client formatted as an HTTP message.
 */
static int
SendHtmlReply(int connfd, char *status, char *html)
{
  int err;
  char clbuf[sizeof("Content-length: XXXXXXXXX")];
  snprintf(clbuf, sizeof(clbuf), "Content-length: %d", (int)strlen(html));

#define _WL(string)                                             \
  err = HttpWriteLine(connfd, (string), strlen(string));        \
  if (err < 0) return err;
  
  /*
   * Output:
   * status line
   * Headers
   * BlankLine
   * html
   * BlankLine
   */
  _WL(status);
  _WL("Connection: close");
  _WL("Content-Type: text/html");
  _WL(clbuf);
  _WL("");
  _WL(html);
  _WL("");

#undef _WL

  return 0;
}

/*
 * Send a HTTP reply back to the client formatted as plain text
 */
static int
SendTextReply(int connfd, char *status, char *text)
{
  int err;
  char clbuf[sizeof("Content-length: XXXXXXXXX")];
  snprintf(clbuf, sizeof(clbuf), "Content-length: %d", (int)strlen(text));
  
#define _WL(string)                                                     \
  err = HttpWriteLine(connfd, (string), strlen(string));                \
  if (err < 0) return err;
  
  /*
   * Output:
   * status line
   * Headers
   * BlankLine
   * html
   * BlankLine
   */
  _WL(status);
  _WL("Connection: close");
  _WL("Content-Type: text/plain");
  _WL(clbuf);
  _WL("");
  _WL(text);
  _WL("");

#undef _WL

  return 0;
}
