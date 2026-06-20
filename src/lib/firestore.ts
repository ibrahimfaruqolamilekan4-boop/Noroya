import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  type QueryConstraint
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  let errString = "";
  try {
    errString = JSON.stringify(errInfo);
  } catch (e) {
    errString = `[Unserializable Firestore Error: ${errInfo.error}, operation: ${errInfo.operationType}, path: ${errInfo.path}]`;
  }
  console.warn('Firestore Non-Fatal Warning: ', errString);
  if (operationType !== OperationType.LIST && operationType !== OperationType.GET) {
    throw new Error(errString);
  }
}

export function subscribeToTransactions(userId: string, callback: (transactions: any[]) => void) {
  if (!userId) {
    callback([]);
    return () => {};
  }
  const path = 'transactions';

  // If the user has a simulated session (meaning no real firebase user is authenticated), bypass Firestore calls
  if (!auth.currentUser) {
    const simulated = localStorage.getItem("vtu_simulated_transactions");
    if (simulated) {
      try {
        const parsed = JSON.parse(simulated);
        callback(parsed.filter((t: any) => t.userId === userId));
      } catch (e) {
        callback([]);
      }
    } else {
      callback([]);
    }
    return () => {};
  }

  const q = query(
    collection(db, path),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
    // Fallback to local storage if denied
    const simulated = localStorage.getItem("vtu_simulated_transactions");
    if (simulated) {
      try {
        const parsed = JSON.parse(simulated);
        callback(parsed.filter((t: any) => t.userId === userId));
      } catch (e) {}
    }
  });
}

export function subscribeToServicePlans(callback: (plans: any[]) => void) {
  const path = 'data_plans';
  const q = query(
    collection(db, path)
  );

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

