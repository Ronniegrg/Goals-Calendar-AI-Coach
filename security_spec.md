# Security Specification & Payload-First TDD (`firestore.rules`)

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every user document (`/users/{userId}`) and every sub-collection record (`/goals`, `/notes`, `/media`, `/tests`, `/flashcards`, `/events`, `/notifications`, `/coachChats`) belongs strictly to `userId == request.auth.uid` and requires `ownerUid == request.auth.uid` with `request.auth.token.email_verified == true` for writes.
2. **Master Gate Parent Existence**: Sub-collection writes (`create`, `update`, `delete`) verify that the parent `/users/{userId}` document exists.
3. **Document ID Hardening**: All path IDs (`userId`, `goalId`, `noteId`, `mediaId`, `testId`, `flashcardId`, `eventId`, `notificationId`, `chatId`) must match `^[a-zA-Z0-9_-]+$` and `<= 128` characters.
4. **No Unbounded / Oversized Blobs**: Every string field has an explicit `.size() <= MAX` bound; `StudyMediaRecord.dataUrl` is capped at `900,000` chars (`byteSize <= 700,000`) so every Firestore document remains safely under 1 MiB. `StudyNoteRecord.screenshots` holds at most 24 short references (`<= 512` chars each).
5. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on `create` and remain unchanged on `update`; `updatedAt` must equal `request.time` on both `create` and `update`; `ownerUid` and `id` cannot be reassigned on `update`.
6. **Zero-Trust Queries**: `allow list` on every subcollection explicitly enforces `resource.data.ownerUid == request.auth.uid`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Read/Write**: `auth = null` attempting `get(/users/u1)` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `auth = { uid: 'u1', email_verified: false }` creating `/users/u1` -> `PERMISSION_DENIED`.
3. **Cross-User Workspace Read/List**: `auth = { uid: 'u2', email_verified: true }` listing `/users/u1/goals` -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Create**: `u1` creates `/users/u1/goals/g1` with `ownerUid: 'u2'` -> `PERMISSION_DENIED`.
5. **Owner Reassignment on Update**: `u1` updates `/users/u1/goals/g1` changing `ownerUid: 'u2'` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection**: `u1` creates `/users/u1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
7. **Timestamp Forgery on Create**: `u1` creates `/users/u1/notes/n1` with client backdated `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
8. **Immutable `createdAt` Tampering on Update**: `u1` updates `/users/u1/notes/n1` altering `createdAt` -> `PERMISSION_DENIED`.
9. **Path ID Poisoning**: `u1` writes `/users/u1/notes/${'a'.repeat(300)}` or `bad/id` -> `PERMISSION_DENIED`.
10. **Oversized Media / Base64 Injection in Note Screenshots**: `u1` puts a 500 KB inline `data:image/...` string in `screenshots[0]` -> `PERMISSION_DENIED` (`screenshots[0].size() <= 512`).
11. **Oversized Media Document (>1 MB DoW Attack)**: `u1` writes `/users/u1/media/med_1` with `dataUrl.size() > 900000` -> `PERMISSION_DENIED`.
12. **Orphaned Subcollection Write Before Parent Workspace**: `u1` creates `/users/u1/goals/g1` when `/users/u1` does not exist -> `PERMISSION_DENIED`.
