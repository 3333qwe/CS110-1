#ifndef account_struct_h
#define account_struct_h

#include <pthread.h>
#include <stdint.h>

typedef uint64_t AccountNumber;
typedef int64_t AccountAmount;


/* Account structure */
typedef struct Account {
  AccountNumber accountNumber;
  AccountAmount balance;
  // One lock for every account
  //pthread_mutex_t *lock;
  pthread_mutex_t lock;
} Account;

#endif
