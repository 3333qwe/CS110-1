/*
 * pathstore.c  - Store pathnames for indexing
 */

#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <assert.h>
#include <ctype.h>
#include <string.h>
#include <inttypes.h>

#include "index.h"
#include "fileops.h"
#include "pathstore.h"
#include "proj1/chksumfile.h"

typedef struct PathstoreElement {
  char *pathname;
  struct PathstoreElement *nextElement;
  char chksum[CHKSUMFILE_SIZE];
} PathstoreElement;

static uint64_t numdifferentfiles = 0;
static uint64_t numsamefiles = 0;
static uint64_t numdiffchecksum = 0;
static uint64_t numdups = 0;
static uint64_t numcompares = 0;
static uint64_t numstores = 0;

static int SameFileIsInStore(Pathstore *store, char *pathname);
static int IsSameFile(char *pathname1, char
		      *pathname2,char *chksum1,char *chksum2);

Pathstore*
Pathstore_create(void *fshandle)
{
  Pathstore *store = malloc(sizeof(Pathstore));
  if (store == NULL)
    return NULL;

  store->elementList = NULL;
  store->fshandle = fshandle;

  return store;
}

/*
 * Free up all the sources allocated for a pathstore.
 */
void
Pathstore_destory(Pathstore *store)
{
  PathstoreElement *e = store->elementList;

  while (e) {
    PathstoreElement *next = e->nextElement;
    free(e->pathname);
    free(e);
    e = next;
  }
  free(store);
}

/*
 * Store a pathname in the pathname store.
 */
char*
Pathstore_path(Pathstore *store, char *pathname, int discardDuplicateFiles)
{
  PathstoreElement *e;

  numstores++;

  if (discardDuplicateFiles) {
    if (SameFileIsInStore(store,pathname)) {
      numdups++;
      return NULL;
    }
  }

  e = malloc(sizeof(PathstoreElement));
  if (e == NULL) {
    return NULL;
  }

  e->pathname = strdup(pathname);
  if (e->pathname == NULL) {
    free(e);
    return NULL;
  }
  e->nextElement = store->elementList;
  store->elementList = e;
  struct unixfilesystem *fs = (struct unixfilesystem *) (store->fshandle);
  int err = chksumfile_bypathname(fs, pathname, e->chksum);
  if (err < 0) return NULL;
  return e->pathname;

}

/*
 * Is this file the same as any other one in the store
 */
static int
SameFileIsInStore(Pathstore *store, char *pathname)
{
  PathstoreElement *e = store->elementList;
  struct unixfilesystem *fs = (struct unixfilesystem *) (store->fshandle);  

  // The checksum for this element
  char chksum[CHKSUMFILE_SIZE];
  int err = chksumfile_bypathname(fs, pathname, chksum);
  if (err < 0) {
    fprintf(stderr,"Can't checksum path %s\n", pathname);
    return 0;
  }

  while (e) {
    if (IsSameFile(pathname, e->pathname,chksum,e->chksum)) {
      return 1;  // In store already
    }
    e = e->nextElement;
  }
  return 0; // Not found in store
}

/*
 * Do the two pathnames refer to a file with the same contents.
 */
static int
IsSameFile(char *pathname1, char *pathname2, char
	   *chksum1,char *chksum2)
{
  numcompares++;
  if (strcmp(pathname1, pathname2) == 0) {
    return 1; // Same pathname must be same file.
  }

  /* Compute the chksumfile of the second file to see if they are the same */
  if (chksumfile_compare(chksum1, chksum2) == 0) {
    numdiffchecksum++;
    return 0;  // Checksum mismatch, not the same file
  }
  
  /* Checksums match, do a content comparison */
  int fd1 = Fileops_open(pathname1);
  if (fd1 < 0) {
    fprintf(stderr, "Can't open path %s\n", pathname1);
    return 0;
  }

  int fd2 = Fileops_open(pathname2);
  if (fd2 < 0) {
    Fileops_close(fd1);
    fprintf(stderr, "Can't open path %s\n", pathname2);
    return 0;
  }
  char *str1,*str2;
  //int success1,success2,offset1,offset2;
  int success,offset1,offset2;
  do{
    success = Fileops_getword(fd1,&offset1,&str1);
    success = Fileops_getword(fd2,&offset2,&str2);
    if(strcmp(str1,str2) != 0){
      break; // Mismatch in words - exit loop with str1 != str2
    }
  }while(success != -1); 
  // If files match then success1 == success2 == -1

  Fileops_close(fd1);
  Fileops_close(fd2);

  if( strcmp(str1,str2) == 0){
    numsamefiles++;
    return 1;
  }else{
    numdifferentfiles++;
    return 0;
  }
}

void
Pathstore_dumpstats(FILE *file)
{
  fprintf(file,
          "Pathstore:  %"PRIu64" stores, %"PRIu64" duplicates\n"
          "Pathstore2: %"PRIu64" compares, %"PRIu64" checksumdiff, "
          "%"PRIu64" comparesuccess, %"PRIu64" comparefail\n",
          numstores, numdups, numcompares, numdiffchecksum,
          numsamefiles, numdifferentfiles);
}
