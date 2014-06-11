#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>
#include <stdbool.h>
#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include <pthread.h>
#include <assert.h>
#include "diskimg.h"
#include "disksim.h"

#include "debug.h"
#include "cachemem.h"

static uint64_t numreads, numwrites;



typedef struct{
  int sectorNum;
  int size;
  char buf[DISKIMG_SECTOR_SIZE];
  int isAllocated;
}SectorEntry;

// Number entries in the cache
static int numEntries;
static int numEntriesInCache;

/* Open a disk image for I/O.  Returns an open file descriptor, or -1 if
 * unsuccessful  */
int
diskimg_open (char *pathname, int readOnly)
{
  int fd = disksim_open(pathname,readOnly);      
  // zero entries initially in the cache
  numEntries = 0;
  numEntriesInCache = 0;
  return fd;
}

/*
 * Return the size of the disk image in bytes, or -1 if unsuccessful.
 */
int
diskimg_getsize(int fd)
{
  return disksim_getsize(fd);
}

/*
 * Look for the sector on the cache before fetching from disk.
 * Return 1 if we found it in the cache, zero otherwise
 */
int 
foundInCache(int sectorNo,void *buf,int *size){
  SectorEntry *cacheMem = cacheMemPtr;
  int numEntries = cacheMemSizeInKB * 1024 / sizeof(SectorEntry);
  // Hashing by index. Look in the bucket where this sector should be
  int index = sectorNo % numEntries;
  SectorEntry *ptr = &cacheMem[index];
  // Found a match
  if(ptr->sectorNum == sectorNo && ptr->isAllocated){
    // Set the size
    *size = ptr->size;
    memcpy(buf,&(ptr->buf),ptr->size);
    return 1;
  }
  return 0;
}

/*
 * If the sector is not in the cache, fetch it from the disk and store it
 * on the
 */
int
fetch(int fd,int sectorNum, void *buf)
{
  SectorEntry entry;  
  // Fetch the sector in the buffer
  entry.size = disksim_readsector(fd, sectorNum, buf);
  
  // Copy the buffer into the Sector Entry
  entry.sectorNum = sectorNum;
  entry.isAllocated = 1;
  memcpy(entry.buf, buf, entry.size);

  SectorEntry *cacheMem = cacheMemPtr;
  
  // Maximum number of structs that fit in the cache
  int maxEntries = cacheMemSizeInKB * 1024 / sizeof(SectorEntry);

  // Hash by the sector number
  int index = sectorNum % maxEntries;

  // Copy the structure into the cache
  SectorEntry *currEntry = &cacheMem[index]; 
  memcpy(currEntry,&entry,sizeof(SectorEntry));
 
  return entry.size;
}

/*
 * Read the specified sector from the disk.  Return number of bytes read, or -1
 * on error.
 */
int
diskimg_readsector(int fd, int sectorNum, void *buf)
{
  numreads++;
  int size = 0;
  // Look for the sector in the cache before looking in the disk
  if( foundInCache(sectorNum,buf,&size) ){
    return size;
  }else{    
    return fetch(fd,sectorNum,buf);
  }
}

/*
 * Write the specified sector to the disk.  Return number of bytes written,
 * -1 on error.
 */
int diskimg_writesector(int fd, int sectorNum, void *buf)
{
  numwrites++;
  return disksim_writesector(fd, sectorNum, buf);
}

/*
 * Clean up from a previous diskimg_open() call.  Returns 0 on success, -1 on
 * error
 */
int
diskimg_close(int fd)
{
  return disksim_close(fd);
}

void
diskimg_dumpstats(FILE *file)
{
  fprintf(file, "Diskimg: %"PRIu64" reads, %"PRIu64" writes\n",
          numreads, numwrites);
}
