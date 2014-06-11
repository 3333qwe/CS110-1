/*
 * scan.c  -  This module provides scans files and inserts them
 * into the index.
 */

#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <assert.h>
#include <ctype.h>
#include <string.h>
#include <inttypes.h> // for PRIu64

#include "index.h"
#include "fileops.h"
#include "scan.h"
#include "debug.h"

#include "proj1/direntv6.h"

static uint64_t numfiles = 0;
static uint64_t numwords = 0;
static uint64_t numchars = 0;
static uint64_t numdups = 0;
static uint64_t numdirs = 0;
static uint64_t numdirents = 0;


#define MAX_WORD_SIZE 64

/*
 * Tokenize the specified file and place it in the index.
 */

int
Scan_File(char *inpathname, Index *ind, Pathstore *store, int discardDups)
{
  // Save the pathname in the store
  char *pathname  = Pathstore_path(store, inpathname,discardDups);
  if (pathname == NULL) {
    numdups++;
    DPRINTF('s',("Scan_Pathname discard dup (%s)\n", inpathname));
    return 0;
  }
  numfiles++;
  DPRINTF('s', ("Scan_Pathname(%s)\n", pathname));

  int fd = Fileops_open(pathname);
  if (fd < 0) {
    fprintf(stderr, "Can't open pathname %s\n", pathname);
    return -1;
  }
  int offset;
 
  char *word;

  // Get a word from the file
  int success = Fileops_getword(fd,&offset,&word);
  // Keep on reading till we get to a word
  while(!(success < 0)){
    
    // Only store alphabetic words
    if( isalpha(word[0]) ){

      bool ok = Index_StoreEntry(ind, word, pathname, offset);
      assert(ok);
     
      // Free the word
      free(word);
      numwords++;
    }
    numchars += strlen(word);

    success = Fileops_getword(fd,&offset,&word);
  }

  Fileops_close(fd);
  return 0;

}

int
Scan_TreeAndIndex(char *pathname, Index *ind, Pathstore *store,int discardDups)
{
  const uint32_t MAXPATH = 1024;

  if (Fileops_isfile(pathname)) {
    return Scan_File(pathname, ind, store, discardDups);
  }
  /* Not a file must be directory, process all entries in the directory */
  if (strlen(pathname) > MAXPATH-16) {
    fprintf(stderr, "Too deep of directories %s\n", pathname);
    return -1;
  }
  numdirs++;

  int dirfd = Fileops_open(pathname);
  if (dirfd < 0) {
    fprintf(stderr, "Can't open pathname %s\n", pathname);
    return -1;
  }

  if (pathname[1] == 0) {
    /* pathame == "/" */
    pathname++; /* Delete extra / character */
  }


  int ret;
  while (1)  {
    struct direntv6 dirent;
    ret = Fileops_read(dirfd, (char *)&dirent, sizeof(struct direntv6));

    if (ret == 0)  {
      /* Done with directory */
      break;
    }

    if (ret != sizeof(struct direntv6)) {
      fprintf(stderr, "Error reading directory %s\n", pathname);
      ret = -1;
      break;
    }

    numdirents++;
    char *n = dirent.d_name;
    if (n[0] == '.') {
      if ((n[1] == 0) || ((n[1] == '.') && (n[2] == 0))) {
	/* Skip over "." and ".." */
	continue;
      }
    }

    char nextpath[MAXPATH];
    sprintf(nextpath, "%s/%s",pathname, n);
    Scan_TreeAndIndex(nextpath, ind, store, discardDups);
  }

  Fileops_close(dirfd);
  return ret;

}

void
Scan_dumpstats(FILE *file)
{
  fprintf(file,
	  "Scan: %"PRIu64" files, %"PRIu64" words, %"PRIu64" characters, "
          "%"PRIu64" directories, %"PRIu64" dirents, %"PRIu64" duplicates\n",
	  numfiles, numwords, numchars, numdirs, numdirents, numdups);
}
