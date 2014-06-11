#include <stdio.h>
#include <assert.h>
#include <string.h>

#include "inode.h"
#include "diskimg.h"
#include "ino.h"


// the first 7 addr's point to single indirect blocks
#define NUM_SINGLE_ADDR 7
#define NUM_INDIRECTLISTS 10

// Store some of the indirect lists 
static struct{
  unsigned char buf[DISKIMG_SECTOR_SIZE];
  int sectorNum;
}IndirectList[NUM_INDIRECTLISTS];

// Struct to hold the inode table
typedef struct{
  // The inode table
  struct inode buf[DISKIMG_SECTOR_SIZE / sizeof(struct inode)];
  int sectorIndex;
  int isAllocated;
}InodeTable;

// Store the last used inode table
static InodeTable table ={.isAllocated = 0};              
static int numFetches = 0;
static int numEntriesInList = 0;

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

  int success = 0;
  // Look for the inodeTable in the global before fetching from Disk
  // Use the diskimg to read the inode table sector
  if(table.sectorIndex == sectorIndex && table.isAllocated){
    memcpy(inodeTable, table.buf, DISKIMG_SECTOR_SIZE);

  }else{
    success = diskimg_readsector(fd, sectorIndex, inodeTable); 
    // Return -1 on error
    if (success == -1) return -1;
    
    // Copy the just fetched inode into the global
    table.sectorIndex = sectorIndex;
    table.isAllocated = 1;
    memcpy(table.buf, inodeTable,DISKIMG_SECTOR_SIZE);
  }
  // The inode sector index at which to look in 
  int tableIndex = inumber - offset * nodesPerSector;
   
  // Copy the array into the proper index
  memcpy(inp,&inodeTable[tableIndex],sizeof(struct inode));
 
  return success == -1 ? success: 0;  
}

/* Search for the sector in the global array */
int found(int sectorIndex,uint16_t *sector){
  // Search linearly through the list
  for (int i = 0; i < numEntriesInList;i++){
    // Sectors match
    if(IndirectList[i].sectorNum == sectorIndex){
      // Copy into the sector
      memcpy(sector,&(IndirectList[i].buf),DISKIMG_SECTOR_SIZE);
      return 1;
    }
  }
  return 0;
}

// The sector was not found in the global array, fetch it and place it in
// the array
int fetchInode(int fd, int sectorIndex, uint16_t *sector){
  // Read the indirect sector
  int success = diskimg_readsector(fd, sectorIndex, sector); 
  // Return -1 on error
  if (success == -1) return -1;

  // Index to store in the list
  int index = numFetches % NUM_INDIRECTLISTS;
  numFetches++;
  IndirectList[index].sectorNum = sectorIndex;
  // Memcpy into the global array
  memcpy(&(IndirectList[index].buf),sector,DISKIMG_SECTOR_SIZE);
  // Increase the num entries of list up until the max
  if(numFetches < NUM_INDIRECTLISTS){
    numEntriesInList++;
  }
  return 0;
}

/*        
 * The first 7 int's in the inode's i_addr field point to single linked sectors
 */
int singleLinkedSector(int fd,int blockNum, int numBlocks,int addrIndex,struct inode *inp){
  // The indirect sector's disc index 
  uint16_t sectorIndex = inp->i_addr[addrIndex];
  
  // The offset in the sector to get to the requested block
  int offset = blockNum - (addrIndex) * numBlocks;

  // Create the indirect sector
  uint16_t sector[DISKIMG_SECTOR_SIZE / sizeof(uint16_t)];
  // Found in the global array
  if(found(sectorIndex,sector)){
    return sector[offset];
  }else{
    int success = fetchInode(fd,sectorIndex,sector);
    if(success == -1) return -1;
  }

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

  // Found in the global array
  if(found(sectorIndex,doubleLinkedSector)){
    
  }else{
    int success = fetchInode(fd,sectorIndex,doubleLinkedSector);
    if(success == -1) return -1;
  }
  
  // Subtract out the number of blocks in the first 7 addrs
  int shiftedIndex = blockNum - numSingleBlocks;
  
  // The index in the double linked sector to look into
  int doubleLinkedIndex = shiftedIndex / numBlocks;
  
  // The block number of the singleLinked sector
  // Sector is a double Linked indirect
  uint16_t singleLinkedIndex = doubleLinkedSector[doubleLinkedIndex];
  		
  // singleLinked sector declaratoin
  uint16_t singleLinkedSector[DISKIMG_SECTOR_SIZE / sizeof(uint16_t)];
  
  // Found in the global array
  if(found(singleLinkedIndex,singleLinkedSector)){
    
  }else{
    int success = fetchInode(fd,singleLinkedIndex,singleLinkedSector);  
    if (success == -1) return -1;
  }

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
