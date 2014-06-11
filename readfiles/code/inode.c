#include <stdio.h>
#include <assert.h>
#include <string.h>

#include "inode.h"
#include "diskimg.h"
#include "ino.h"


// the first 7 addr's point to single indirect blocks
#define NUM_SINGLE_ADDR 7

/*
 * Fetch the specified inode from the filesystem. 
 * Return 0 on success, -1 on error.  
 */
int
inode_iget(struct unixfilesystem *fs, int inumber, struct inode *inp)
{  
  // Subtract one since inumbers start at 1	
  inumber -= 1;
  // Handle from the diskimg module to read/write the diskimg. 
  int fd = fs->dfd;
  // Num nodes per sector
  int nodesPerSector = DISKIMG_SECTOR_SIZE / sizeof(struct inode);
  
  // Offset to the start sector of the inode table
  int offset = inumber / nodesPerSector;

  // The sector index at which to read from the disk
  int sectorIndex = INODE_START_SECTOR + offset;
  // The indode table
  struct inode inodeTable[DISKIMG_SECTOR_SIZE / sizeof(struct inode)];
  // Use the diskimg to read the inode table sector
  int success = diskimg_readsector(fd, sectorIndex, inodeTable); 
  // Return -1 on error
  if (success == -1) return -1;
  
  // The inode sector index at which to look in 
  int tableIndex = inumber - offset * nodesPerSector;
   
  // Copy the array into the proper index
  memcpy(inp,&inodeTable[tableIndex],sizeof(struct inode));
 
  return success == -1 ? success: 0;  
}

/*
 * The first 7 int's in the inode's i_addr field point to sinlge linked sectors
 */
int singleLinkedSector(int fd,int blockNum, int numBlocks,int addrIndex,struct inode *inp){
	// The indirect sector's disc index 
  		uint16_t sectorIndex = inp->i_addr[addrIndex];
  		
  		// Create the indirect sector
  		uint16_t sector[DISKIMG_SECTOR_SIZE / sizeof(uint16_t)];
  		// Read the indirect sector
  		int success = diskimg_readsector(fd, sectorIndex, sector); 
  	
  		// Return -1 on error
  		if (success == -1) return -1;
  	 			
  		// The offset in the sector to get to the requested block
  		int offset = blockNum - (addrIndex) * numBlocks;
  		return sector[offset];		
}


/*
 * The 8th i_addr points to a doubly indirect sector
 */ 
int doublyLinkedSector(int fd,int blockNum,int numSingleBlocks,int numBlocks,struct inode *inp){
		// The doubly indirect sector's disc index
  		uint16_t sectorIndex = inp->i_addr[NUM_SINGLE_ADDR];
  		
  		// Create the doubly linked sector
  		uint16_t doubleLinkedSector[DISKIMG_SECTOR_SIZE / sizeof(uint16_t)];
  		// Read the doubly linked sector
  		int success = diskimg_readsector(fd,sectorIndex,doubleLinkedSector);
  		if (success == -1) return -1;
  		
  		// Subtract out the number of blocks in the first 7 addrs
  		int shiftedIndex = blockNum - numSingleBlocks;
  
  		// The index in the double linked sector to look into
  		int doubleLinkedIndex = shiftedIndex / numBlocks;
  		
  		// The block number of the singleLinked sector
  		// Sector is a double Linked indirect
  		uint16_t singleLinkedIndex = doubleLinkedSector[doubleLinkedIndex];
  		
  		// singleLinked sector declaratoin
  		uint16_t singleLinkedSector[DISKIMG_SECTOR_SIZE / sizeof(uint16_t)];
  		// Read the sector
  		success = diskimg_readsector(fd,singleLinkedIndex,singleLinkedSector);
  		
  		if (success == -1) return -1;
  		
  		// The offset in the single index
  		int offset = shiftedIndex - doubleLinkedIndex * numBlocks;
  		return singleLinkedSector[offset];
}

/*
 * Get the location of the specified file block for a large inode.
 * Return the disk block number on success, -1 on error.  
 */
int largeInode(int fd,int blockNum,int numSingleBlocks,int numBlocks,struct inode *inp){
	// Index to look into in the inodes i_addr
  	int addrIndex = blockNum / numBlocks;
  	
  	// First 7 single addrs are singly linked
  	if(addrIndex < NUM_SINGLE_ADDR){
  		return singleLinkedSector(fd,blockNum,numBlocks,addrIndex,inp);
  		
  	// The 8th address points to a doubly linked indirect block
  	}else{
  		return doublyLinkedSector(fd,blockNum,numSingleBlocks,numBlocks,inp);
  	}
  	return -1;
}


/*
 * Get the location of the specified file block of the specified inode.
 * Return the disk block number on success, -1 on error.  
 */
int
inode_indexlookup(struct unixfilesystem *fs, struct inode *inp, int blockNum)
{
  // The number Of blocks in each sector
  int numBlocks = DISKIMG_SECTOR_SIZE / sizeof(uint16_t);
  int numSingleBlocks = numBlocks * NUM_SINGLE_ADDR;
  // Whether the inode is large or small
  int  isLarge = ((inp->i_mode & ILARG  ) != 0);
  // Handle from the diskimg module to read/write the diskimg. */
  int fd = fs->dfd;

  // If the inode is not large, the addresses point to data blocks
  if (!isLarge){
  	
  	// return the sector number for small inodes
  	return inp->i_addr[blockNum];
  	
  // Else the addresses point to indirect and doubly indirect blocks	
  }else{
  	// Return the sector number for large inodes
  	return largeInode(fd,blockNum,numSingleBlocks,numBlocks,inp);
  }
  // Return -1 on error
  return -1;
}

/* 
 * Compute the size of an inode from its size0 and size1 fields.
 */
int
inode_getsize(struct inode *inp) 
{
  return ( (inp->i_size0 << 16) | inp->i_size1); 
}
