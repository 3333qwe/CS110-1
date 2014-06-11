#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <assert.h>
#include <inttypes.h>

#include "teller.h"
#include "account.h"
#include "error.h"
#include "debug.h"
#include "branch.h"


/*
 * deposit money into an account
 */
int
Teller_DoDeposit(Bank *bank, AccountNumber accountNum, AccountAmount amount)
{
  assert(amount >= 0);

  DPRINTF('t', ("Teller_DoDeposit(account 0x%"PRIx64" amount %"PRId64")\n",
                accountNum, amount));

  Account *account = Account_LookupByNumber(bank, accountNum);
  
  if (account == NULL) {
    return ERROR_ACCOUNT_NOT_FOUND;
  }

  // Acquire the account's lock
  pthread_mutex_t *accountLock = &(account->lock);
  pthread_mutex_lock (accountLock);
  
  // The account's branch
  BranchID branchID = AccountNum_GetBranchID(accountNum);
  Branch *branch = &(bank->branches[branchID]);
  
  // Acquire the branch's lock
  pthread_mutex_t *branchLock = &(branch->lock);
  pthread_mutex_lock(branchLock);
  
  Account_Adjust(bank,account, amount, 1);
  
  // Release the account's lock
  pthread_mutex_unlock(accountLock);
  // Release the branch's lock
  pthread_mutex_unlock(branchLock);
  
  return ERROR_SUCCESS;
}

/*
 * withdraw money from an account
 */
int
Teller_DoWithdraw(Bank *bank, AccountNumber accountNum, AccountAmount amount)
{
  assert(amount >= 0);

  DPRINTF('t', ("Teller_DoWithdraw(account 0x%"PRIx64" amount %"PRId64")\n",
                accountNum, amount));

  Account *account = Account_LookupByNumber(bank, accountNum);
  
  if (account == NULL) {
    return ERROR_ACCOUNT_NOT_FOUND;
  }
  // Acquire the account's lock
  pthread_mutex_t *accountLock = &(account->lock);
  pthread_mutex_lock (accountLock);
  
  // The account's branch
  BranchID branchID = AccountNum_GetBranchID(accountNum);
  Branch* branch = &(bank->branches[branchID]);
  
  // Acquire the branch's lock
  pthread_mutex_t *branchLock = &(branch->lock);
  pthread_mutex_lock(branchLock);
  

  if (amount > Account_Balance(account)) {
    pthread_mutex_unlock(accountLock);
    pthread_mutex_unlock(branchLock);
    
    return ERROR_INSUFFICIENT_FUNDS;
  }

  Account_Adjust(bank,account, -amount, 1);
  
  // Release the account's lock
  pthread_mutex_unlock(accountLock);
  // Release the branch's lock
  pthread_mutex_unlock(branchLock);

  return ERROR_SUCCESS;
}

/*
 * do a tranfer from one account to another account
 */
int
Teller_DoTransfer(Bank *bank, AccountNumber srcAccountNum,
                  AccountNumber dstAccountNum,
                  AccountAmount amount)
{
  assert(amount >= 0); 

  DPRINTF('t', ("Teller_DoTransfer(src 0x%"PRIx64", dst 0x%"PRIx64
                ", amount %"PRId64")\n",
                srcAccountNum, dstAccountNum, amount));

  Account *srcAccount = Account_LookupByNumber(bank, srcAccountNum);
  if (srcAccount == NULL) {
    return ERROR_ACCOUNT_NOT_FOUND;
  }
   // If we're transfering from the same account, do nothing
  if (srcAccountNum == dstAccountNum)return ERROR_SUCCESS;

  Account *dstAccount = Account_LookupByNumber(bank, dstAccountNum);
  if (dstAccount == NULL) {
    return ERROR_ACCOUNT_NOT_FOUND;
  }
  
  /*
   * If we are doing a transfer within the branch, we tell the Account module to
   * not bother updating the branch balance since the net change for the
   * branch is 0.
   */
  int updateBranch = !Account_IsSameBranch(srcAccountNum, dstAccountNum);
  
  // The branches' locks
  BranchID srcBranchID = AccountNum_GetBranchID(srcAccountNum);
  Branch *srcBranch = &(bank->branches[srcBranchID]);
  
  BranchID dstBranchID = AccountNum_GetBranchID(dstAccountNum); 
  Branch *dstBranch = &(bank->branches[dstBranchID]);
  
  pthread_mutex_t *srcBranchLock = &(srcBranch->lock);
  pthread_mutex_t *dstBranchLock = &(dstBranch->lock);  
  
  // The account's locks
  pthread_mutex_t *dstLock = &(dstAccount->lock);
  pthread_mutex_t *srcLock = &(srcAccount->lock);

  // Convention for acquiring order, Will always acquire the smaller account's lock first
  if(dstAccountNum < srcAccountNum){
  	pthread_mutex_lock (dstLock);
  	pthread_mutex_lock (srcLock);
  }else{
  	pthread_mutex_lock(srcLock);
  	pthread_mutex_lock(dstLock);
  }

  // Lock the branches if they're different
  if(updateBranch){
	
  	// Convention for locking branches
  	if (srcBranchID < dstBranchID){
  		pthread_mutex_lock(srcBranchLock);
  		pthread_mutex_lock(dstBranchLock);
  	}else{
  		pthread_mutex_lock(dstBranchLock);
  		pthread_mutex_lock(srcBranchLock);
  	}
  }
  
  if (amount > Account_Balance(srcAccount)) {
    pthread_mutex_unlock(srcLock);
    pthread_mutex_unlock(dstLock);
    
    if(updateBranch){
      pthread_mutex_unlock(srcBranchLock);
      pthread_mutex_unlock(dstBranchLock);
    }
    return ERROR_INSUFFICIENT_FUNDS;
  }
 
  Account_Adjust(bank, srcAccount, -amount, updateBranch);
  Account_Adjust(bank, dstAccount, amount, updateBranch);

  // Release the accounts' locks
  pthread_mutex_unlock(dstLock);
  pthread_mutex_unlock(srcLock);
  
  // Release the branches' locks
  if(updateBranch){
  	pthread_mutex_unlock(srcBranchLock);
  	pthread_mutex_unlock(dstBranchLock);	
  }

  return ERROR_SUCCESS;
}
