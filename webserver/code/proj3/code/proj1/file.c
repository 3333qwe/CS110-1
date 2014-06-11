#include <stdio.h>
#include <assert.h>

#include "file.h"
#include "inode.h"
#include "diskimg.h"

/*
 * Fetch the specified file block from the specified inode.
 * Return the number of valid bytes in the block, -1 on error.
 */
int
file_getblock(struct unixfilesystem *fs, int inumber, int blockNum, void *buf)
{
  // Get the specified inode
  struct inode inp;
  int success = inode_iget(fs,inumber,&inp);
  // Return -1 on error
  if (success == -1)return -1;
  
  // Handle from the diskimg modulde to read/write the diskimg
  int fd = fs->dfd;
  
  // Block index in the disk
  int index = inode_indexlookup(fs, &inp, blockNum);
  success = diskimg_readsector(fd,index,buf);
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
