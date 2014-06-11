
#include "directory.h"
#include "inode.h"
#include "diskimg.h"
#include "file.h"
#include <stdio.h>
#include <string.h>
#include <assert.h>


/*
 * Lookup the specified name (name) in the directory (dirinumber). If found, return the 
 * directory entry in dirEnt. Return 0 on success and something negative on failure. 
 */
int
directory_findname(struct unixfilesystem *fs, const char *name,
                   int dirinumber, struct direntv6 *dirEnt)
{
	// Get the directory's inode
	struct inode inp;
	int success = inode_iget(fs, dirinumber, &inp);
	// Return -1 on error
	if (success == -1){
		return -1;
	}
	// The dirinumber does not match to a directory
	if ((inp.i_mode & IFMT) != IFDIR) {
		return -1;
	}
	// The size of the directory
	int size = inode_getsize(&inp);
	
	// Total number of dirent's
	int numDirEnts = size/ sizeof(struct direntv6);
	
	// The number of dirEnt's in one block
	int numDirEntsInBlock = DISKIMG_SECTOR_SIZE / sizeof(struct direntv6);
	
	// The number of blocks the struct consistst of
	int numBlocks = numDirEnts / numDirEntsInBlock;
	// If the number of dirEnts don't fully occupy a block, add one
	if(numDirEnts % numDirEntsInBlock !=0) numBlocks +=1;
	
	
	// Look through all of the blocks in the inode
	for(int block = 0; block < numBlocks; block++){
		
		// Create a buffer
		struct direntv6 dirEntTable[numDirEntsInBlock];
		// Had &dirEntTable
		success = file_getblock(fs,dirinumber,block,dirEntTable);
		
		// Check for error
		if (success < 0){
			return -1;
		}
		
		// Look over all of the dirEnt's in a block
		for(int d = 0; d < numDirEntsInBlock; d++){
			
			struct direntv6 dir = dirEntTable[d];
			
			// See if the strings match	
			if(strcmp(name,dir.d_name) == 0){
				
				// Copy the dir into dirEnt and return
				memcpy(dirEnt,&dir,sizeof(struct direntv6));
				return 0;
			}
			
		}
	}
	// return -1 on no match
	return -1;
}
