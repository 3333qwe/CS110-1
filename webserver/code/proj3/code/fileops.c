/*
 * fileops.c  -  This module provides an Unix like file absraction
 * on the prog1 file system access code
 */

#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>
#include <inttypes.h>
#include <ctype.h>
#include "fileops.h"
#include "proj1/pathname.h"
#include "proj1/unixfilesystem.h"
#include "diskimg.h"
#include "proj1/inode.h"
#include "proj1/file.h"
#include "proj1/chksumfile.h"
#include "cachemem.h"

#define MAX_FILES 64
#define MAX_WORD_SIZE 64
#define MAX_SECTORS 10

static uint64_t numopens = 0;
static uint64_t numreads = 0;
static uint64_t numgetchars = 0;
static uint64_t numisfiles = 0;
/*
 * Table of open files.
 */
static struct {
  char *pathname;    // absolute pathname NULL if slot is not used.
  int  cursor;       // Current position in the file
  unsigned char buf[DISKIMG_SECTOR_SIZE];
  struct inode inode;
  int inumber;
  int inodeSize;
} openFileTable[MAX_FILES];

static struct unixfilesystem *unixfs;

int file_getblockfrominode(struct inode inp, int blockNum,void *buf){

 // Handle from the diskimg modulde to read/write the diskimg
  int fd = unixfs->dfd;
  
  // Block index in the disk
  int index = inode_indexlookup(unixfs, &inp, blockNum);
  int success = diskimg_readsector(fd,index,buf);
  // Return -1 on error
  if(success == -1)return success;
 
  //  The file size
  int fileSize = inode_getsize(&inp);
 
  // The number of sector blocks the file consists of
  int numBlocks = fileSize / DISKIMG_SECTOR_SIZE;
  // Only the last block is not completely full
  if (blockNum < numBlocks) return DISKIMG_SECTOR_SIZE;
  else{
    return fileSize % DISKIMG_SECTOR_SIZE;
  }
}


/*
 * Initialize the fileops module for the specified disk.
 */
void *
Fileops_init(char *diskpath)
{
  memset(openFileTable, 0, sizeof(openFileTable));

  int fd = diskimg_open(diskpath, 1);
  if (fd < 0) {
    fprintf(stderr, "Can't open diskimagePath %s\n", diskpath);
    return NULL;
  }
  unixfs = unixfilesystem_init(fd);
  if (unixfs == NULL) {
    diskimg_close(fd);
    return NULL;
  }
  
  return unixfs;
}

/*
 * Open the specified absolute pathname for reading. Returns -1 on error;
 */
int
Fileops_open(char *pathname)
{
  int fd;
  int inumber;
  struct inode in;
  numopens++;
  inumber = pathname_lookup(unixfs,pathname);
  if (inumber < 0) {
    return -1; // File not found
  }
  for (fd = 0; fd < MAX_FILES; fd++) {
    if (openFileTable[fd].pathname == NULL) break;
  }

  if (fd >= MAX_FILES) {
    return -1;  // No open file slots
  }
  
  openFileTable[fd].pathname = strdup(pathname); // Save our own copy
  openFileTable[fd].cursor = 0;

  // Get the Inode
  int err = inode_iget(unixfs, inumber,&in);
  if (err < 0) {
    return err;
  }
  // Inode is not alloc'd
  if (!(in.i_mode & IALLOC)) {
    return -1;
  }
  openFileTable[fd].inode = in;
  
  // Get the inode size
  openFileTable[fd].inodeSize = inode_getsize(&in);
  // Set the inumber for the file
  openFileTable[fd].inumber = inumber;
 
  return fd;
}


/*
 * Fetch the next character from the file. Return -1 if at end of file.
 */
int
Fileops_getchar(int fd)
{
 
  int bytesMoved;
  int blockNo, blockOffset;

  numgetchars++;

  if (openFileTable[fd].pathname == NULL)
    return -1;  // fd not opened.
  
  int size = openFileTable[fd].inodeSize;
  if (openFileTable[fd].cursor >= size) return -1; // Finished with file

  struct inode inp = openFileTable[fd].inode;

  // The buffer holding the current sector being read
  unsigned char *buf = openFileTable[fd].buf;
  blockNo = openFileTable[fd].cursor / DISKIMG_SECTOR_SIZE;
  blockOffset =  openFileTable[fd].cursor % DISKIMG_SECTOR_SIZE;

  // Read the next buffer when we need to
  if (blockOffset == 0){
    bytesMoved = file_getblockfrominode(inp,blockNo,buf);
    if (bytesMoved < 0) {
      return -1;
    }
    assert(bytesMoved > blockOffset);
  }
  openFileTable[fd].cursor += 1;

  // And returns only one element from the block
  return (int)(buf[blockOffset]);
}

/*
 * Implement the Unix read system call. Number of bytes returned.  Return -1 on
 * er.
 */
int
Fileops_read(int fd, char *buffer, int length)
{
  int i;
  int ch;
  numreads++;
 
  for (i = 0; i < length; i++) {
    ch = Fileops_getchar(fd);
    if (ch == -1) break;
    buffer[i] = ch;
  }
  return i;
}

/*
 * Return the current position in the file.
 */
int
Fileops_tell(int fd)
{
  if (openFileTable[fd].pathname == NULL)
    return -1;  // fd not opened.

  return openFileTable[fd].cursor;
}


/*
 * Close the files - return the resources
 */

int
Fileops_close(int fd)
{
  
  if (openFileTable[fd].pathname == NULL)
    return -1;  // fd not opened.

  free(openFileTable[fd].pathname);
  openFileTable[fd].pathname = NULL;
  return 0;
}

/*
 * Return true if specified pathname is a regular file.
 */
int
Fileops_isfile(char *pathname)
{
  numisfiles++;

  int inumber = pathname_lookup(unixfs, pathname);
  if (inumber < 0) {
    return 0;
  }

  struct inode in;
  int err = inode_iget(unixfs, inumber, &in);
  if (err < 0) return 0;

  if (!(in.i_mode & IALLOC) || ((in.i_mode & IFMT) != 0)) {
    /* Not allocated or not a file */
    return 0;
  }
  return 1; /* Must be a file */
}

void
Fileops_dumpstats(FILE *file)
{
  fprintf(file,
          "Fileops: %"PRIu64" opens, %"PRIu64" reads, "
          "%"PRIu64" getchars, %"PRIu64 " isfiles\n",
          numopens, numreads, numgetchars, numisfiles);
}


int Fileops_getword(int fd, int *offset, char **w){
  // Buffer for the word
  char word[MAX_WORD_SIZE + 1];
  int index = 0;
  int bytesMoved;
  int blockNo, blockOffset;

  if (openFileTable[fd].pathname == NULL){
    return -1;  // fd not opened
  }
  int size = openFileTable[fd].inodeSize;
  if (openFileTable[fd].cursor >= size) return -1; // Finished with file

  struct inode inp = openFileTable[fd].inode;

  // The buffer holding the current sector being read
  unsigned char *buf = openFileTable[fd].buf;

  blockNo = openFileTable[fd].cursor / DISKIMG_SECTOR_SIZE;
  blockOffset =  openFileTable[fd].cursor % DISKIMG_SECTOR_SIZE;

  // Read the next buffer when we're done reading the previous one
  if (blockOffset == 0){
    bytesMoved = file_getblockfrominode(inp,blockNo,buf);
    if (bytesMoved < 0) {
      return -1;
    }
    assert(bytesMoved > blockOffset);
  }
  char ch = buf[blockOffset];
  numgetchars++;
  openFileTable[fd].cursor += 1;
  
  // If we see a nonalpha, return a string of it right away
  if(!isalpha(ch)){
    word[0] = ch;
    word[1] = 0;
    *w = strdup(word);
    return 0;
  }

  // Read chars until we hit a nonalpha character
  while(isalpha(ch)){

    // Finished with the file, return what's there so far
    if (openFileTable[fd].cursor >= size) break;
    
    // Store the char in the buffer
    word[index] = ch;

    // The offset is the cursor at the first letter in the word
    if(index == 0) *offset = openFileTable[fd].cursor;

    blockNo = openFileTable[fd].cursor / DISKIMG_SECTOR_SIZE;
    blockOffset =  openFileTable[fd].cursor % DISKIMG_SECTOR_SIZE;

    // Read the next buffer when we're done reading the previous one
    if (blockOffset == 0){
      bytesMoved = file_getblockfrominode(inp,blockNo,buf);
      if (bytesMoved < 0) {
	return -1;
      }
      assert(bytesMoved > blockOffset);
    }

    // Read the next letter
    ch = buf[blockOffset];

    // Increase the meta data to account for the next character
    openFileTable[fd].cursor += 1;
    numgetchars++;
    index += 1;

    // We're at the max word size. Return what's there so far
    if (index > MAX_WORD_SIZE - 1){
      *w = strdup(word);
      return 0;
    }
  }
  // Add the null terminator
  word[index] = 0;
  // Get the word
  *w = strdup(word);
  return 0;
}

