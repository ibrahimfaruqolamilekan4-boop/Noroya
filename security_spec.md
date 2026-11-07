# Security Specification for Noroya Data

## Data Invariants
1. **User Profiles**: 
   - A user can only read and update their own document in `/users/{userId}`.
   - RBAC fields (`role`, `balance`) cannot be updated by the user through the client SDK.
   - `referralCode` is assigned at creation and remains immutable.
2. **Transactions**:
   - A transaction must be associated with the currently authenticated user (`userId == auth.uid`).
   - Transactions are immutable once created (or at least terminal states like `completed` or `failed` are locked).
   - Users can only list their own transactions.
3. **Service Plans**:
   - Read access is public for all authenticated users.
   - Write access (create/update/delete) is restricted to users with the `admin` role.

## The Dirty Dozen (Malicious Payloads)

1. **Self-Promotion**: User trying to change their role to 'admin'.
   - Path: `/users/user123`
   - Payload: `{ "role": "admin" }`
   - Goal: `PERMISSION_DENIED`

2. **Money Injection**: User trying to increase their own balance.
   - Path: `/users/user123`
   - Payload: `{ "balance": 1000000 }`
   - Goal: `PERMISSION_DENIED`

3. **Transaction Spoofing**: User A trying to create a transaction for User B.
   - Path: `/transactions/tx123`
   - Payload: `{ "userId": "userB", "amount": 100, "type": "funding", "status": "completed" }`
   - Goal: `PERMISSION_DENIED`

4. **Peeping Tom**: User A trying to read User B's profile.
   - Path: `/users/userB`
   - Goal: `PERMISSION_DENIED`

5. **History Theft**: User A trying to list User B's transactions.
   - Query: `where("userId", "==", "userB")` on `/transactions`
   - Goal: `PERMISSION_DENIED`

6. **Admin Impersonation (Plan Change)**: Non-admin trying to lower the price of a plan.
   - Path: `/servicePlans/mtn-1gb`
   - Payload: `{ "price": 1 }`
   - Goal: `PERMISSION_DENIED`

7. **Ghost Field Update**: User trying to add a non-existent field `isVerified` to their profile.
   - Path: `/users/user123`
   - Payload: `{ "fullName": "New Name", "isVerified": true }`
   - Goal: `PERMISSION_DENIED`

8. **ID Poisoning**: Creating a transaction with a massive junk string as ID.
   - Path: `/transactions/very-long-junk-id-over-128-chars...`
   - Goal: `PERMISSION_DENIED`

9. **Terminal State Shortcut**: User trying to update a failed transaction to "completed".
   - Path: `/transactions/tx123` (where status is already 'failed')
   - Payload: `{ "status": "completed" }`
   - Goal: `PERMISSION_DENIED`

10. **Orphaned Transaction**: Creating a transaction without a valid user reference.
    - Path: `/transactions/tx456`
    - Payload: `{ "userId": "non-existent-user", ... }`
    - Goal: `PERMISSION_DENIED` (using `exists()`)

11. **PII Blanket Read**: Trying to list all users to scrape emails.
    - Path: `/users`
    - Goal: `PERMISSION_DENIED` (unless query is filtered by auth.uid)

12. **Timestamp Forgery**: Creating a transaction with a future timestamp from the client.
    - Path: `/transactions/tx789`
    - Payload: `{ "createdAt": "2030-01-01T00:00:00Z" }`
    - Goal: `PERMISSION_DENIED` (must be `request.time`)
