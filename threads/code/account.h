#ifndef _ACCOUNT_H
#define _ACCOUNT_H

#include <stdint.h>
#include <pthread.h>
#include "account_struct.h"
#include "branch.h"

Account *Account_LookupByNumber(struct Bank *bank, AccountNumber accountNum);

void Account_Adjust(struct Bank *bank, Account *account,
                    AccountAmount amount,
                    int updateBranch);

AccountAmount Account_Balance(Account *account);

AccountNumber Account_MakeAccountNum(int branch, int subaccount);

int Account_IsSameBranch(AccountNumber accountNum1, AccountNumber accountNum2);

void Account_Init(Bank *bank, Account *account, int id, int branch,
                  AccountAmount initialAmount);
                  
BranchID AccountNum_GetBranchID(AccountNumber accountNum);

#endif /* _ACCOUNT_H */
