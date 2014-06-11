
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <assert.h>
#include <pthread.h> 

#include "teller.h"
#include "account.h"
#include "error.h"
#include "debug.h"
#include "branch.h"
#include "report.h"


/*
 * initialize the account based on the passed-in information.
 */
void
Account_Init(Bank *bank, Account *account, int id, int branch,
             AccountAmount initialAmount)
{

  account->accountNumber = Account_MakeAccountNum(branch, id);
  account->balance = initialAmount;
  // Initialze the account's lock before first use
  //pthread_mutex_t *lock = malloc(sizeof(pthread_mutex_t));
  pthread_mutex_t lock;
  // Recursive locks
  pthread_mutexattr_t attr;
  pthread_mutexattr_init(&attr);
  pthread_mutexattr_settype(&attr,PTHREAD_MUTEX_RECURSIVE);

  pthread_mutex_init(&lock, &attr);
  account->lock = lock;
}

/*
 * get the ID of the branch which the account is in.
 */
BranchID
AccountNum_GetBranchID(AccountNumber accountNum)
{
  Y;
  return (BranchID) (accountNum >> 32);
}

/*
 * get the branch-wide subaccount number of the account.
 */
int
AcountNum_Subaccount(AccountNumber accountNum)
{
  Y;
  return  (accountNum & 0x7ffffff);
}

/*
 * find the account address based on the accountNum.
 */
Account *
Account_LookupByNumber(Bank *bank, AccountNumber accountNum)
{
  BranchID branchID =  AccountNum_GetBranchID(accountNum);
  int branchIndex = AcountNum_Subaccount(accountNum);
  return &(bank->branches[branchID].accounts[branchIndex]);
}

/*
 * adjust the balance of the account. The balance is protected by a lock
 */
void
Account_Adjust(Bank *bank, Account *account, AccountAmount amount,
               int updateBranch)
{

  account->balance = Account_Balance(account) + amount;
  if (updateBranch) {
    Branch_UpdateBalance(bank, AccountNum_GetBranchID(account->accountNumber),
                         amount);
  }
  Y;
}
/*
 * Return the balance of the account. The balance is shared 
 * data that needs to be protected by locks
 */
AccountAmount
Account_Balance(Account *account)
{  

  // Acquire the lock
  pthread_mutex_t *lock = &(account->lock);
  pthread_mutex_lock(lock);

  AccountAmount balance = account->balance; Y;
  
  // Release the lock 
  pthread_mutex_unlock(lock);
  return balance;
}

/*
 * make the account number based on the branch number and
 * the branch-wise subaccount number.
 */
AccountNumber
Account_MakeAccountNum(int branch, int subaccount)
{
  AccountNumber num;

  num = subaccount;
  num |= ((uint64_t) branch) << 32;  Y;
  return num;
}

/*
 * Test to see if two accounts are in the same branch.
 */

int
Account_IsSameBranch(AccountNumber accountNum1, AccountNumber accountNum2)
{
  return (AccountNum_GetBranchID(accountNum1) ==
          AccountNum_GetBranchID(accountNum2));
}
