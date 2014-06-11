
#include "pathname.h"
#include "directory.h"
#include "inode.h"
#include "diskimg.h"
#include <stdio.h>
#include <string.h>
#include <assert.h>
#include <stdlib.h>

// Returns the rest of the directory in the path name
char *rest(const char *path){
	
	const char *delim = "/";
	char *restOfPath = strstr(path,delim);
		
	// Return the null terminiator /0 on NULL (no more '/' found)
	if (restOfPath == NULL) {
		char *nullTerminator = (char *)path + strlen(path);
	}
	// Remove the delim from the rest of the path
	restOfPath += strlen(delim);
	return restOfPath;
}

// Returns the first directory in the path name
char *first(const char *path){
	// The rest of the string after the delim
	char *restOfPath = rest(path);
	
	// The length of the string before the delim
	int firstLen = strlen(path) - strlen(restOfPath) - 1;
	// The string before the delim
	// +1 for the null terminator
	char *first = malloc(firstLen + 1);
	strncpy(first,path,firstLen);
	// Null terminated appended 
	first[firstLen] ='\0';
	return first;
}


/*
 * Return whether the name is plain(a file) or not (a directory)
 */
int plain_name(const char* name){
	// Pointer to the first slash in the pathname
	char *firstpass = strchr(name,'/');
	// If no slash is found, the name is plain
	return firstpass == NULL;
}

/*
 * Returns the inumber associated with a pathname recursively
 */

int path_to_inumber(struct unixfilesystem *fs, const char *pathname,uint16_t dirinumber){
	struct direntv6 buf;
	// The pathname is to a file
	if(plain_name(pathname)){
		int success = directory_findname(fs,pathname,dirinumber, &buf);
		if (success < 0){
			return -1;
		}
		// Return the inumber
		return buf.d_inumber;
	// The pathname is to a directory
	}else{
		// The first directory in the pathname
		char *dir = first(pathname);
		int success = directory_findname(fs, dir, dirinumber, &buf);
		// Check for errors
		if (success < 0){
			return -1;
		}
		// The rest of the pathname
		const char *restOfPath = rest(pathname);
		dirinumber = buf.d_inumber;
		free(dir);
		return path_to_inumber(fs,restOfPath,dirinumber);
	}
	
}

/*
 * Return the inumber associated with the specified pathname. This need only
 * handle absolute paths. Return a negative number if an error is encountered.
 */
int
pathname_lookup(struct unixfilesystem *fs, const char *pathname)
{
	// Looking for the 
	if(strcmp(pathname,"/") == 0) return ROOT_INUMBER;
	// Get rid of the first slash
	pathname += strlen("/");
	return path_to_inumber(fs,pathname,ROOT_INUMBER);
}
