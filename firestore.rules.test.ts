/**
 * Payload-First Security Test Specification for Firestore Rules ("Dirty Dozen")
 * Verifies identity isolation, Master Gate, strict schema validation, and temporal integrity.
 */

export interface DirtyDozenScenario {
  name: string;
  path: string;
  operation: "get" | "list" | "create" | "update" | "delete";
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: "PERMISSION_DENIED";
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenScenario[] = [
  {
    name: "1. Unauthenticated read on user workspace",
    path: "/users/user_1",
    operation: "get",
    auth: null,
    expected: "PERMISSION_DENIED"
  },
  {
    name: "2. Unverified email account writing workspace",
    path: "/users/user_1",
    operation: "create",
    auth: { uid: "user_1", email_verified: false },
    payload: {
      ownerUid: "user_1",
      email: "user1@example.com",
      coachPersona: "mentor",
      autopilotMode: "full_autonomous",
      autopilotPacing: "balanced"
    },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "3. Cross-user list on another user's goals subcollection",
    path: "/users/user_1/goals",
    operation: "list",
    auth: { uid: "attacker_2", email_verified: true },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "4. Identity spoofing (ownerUid mismatch on create)",
    path: "/users/user_1/goals/goal_1",
    operation: "create",
    auth: { uid: "user_1", email_verified: true },
    payload: {
      id: "goal_1",
      ownerUid: "user_2",
      name: "Spoofed Goal",
      type: "study",
      category: "CS",
      weeklyTarget: 3,
      durationMinutes: 45,
      timePreference: "morning",
      completedCount: 0,
      color: "indigo",
      clientCreatedAt: "2026-11-27T00:00:00.000Z"
    },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "5. Owner reassignment on update",
    path: "/users/user_1/goals/goal_1",
    operation: "update",
    auth: { uid: "user_1", email_verified: true },
    payload: { ownerUid: "user_2" },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "6. Shadow/ghost field injection (isAdmin: true)",
    path: "/users/user_1",
    operation: "create",
    auth: { uid: "user_1", email_verified: true },
    payload: {
      ownerUid: "user_1",
      email: "user1@example.com",
      coachPersona: "mentor",
      autopilotMode: "full_autonomous",
      autopilotPacing: "balanced",
      isAdmin: true
    },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "7. Client timestamp forgery on note create",
    path: "/users/user_1/notes/note_1",
    operation: "create",
    auth: { uid: "user_1", email_verified: true },
    payload: {
      id: "note_1",
      goalId: "goal_1",
      ownerUid: "user_1",
      title: "Test",
      category: "summary",
      content: "Body",
      clientCreatedAt: "2026-01-01T00:00:00Z",
      clientUpdatedAt: "2026-01-01T00:00:00Z",
      createdAt: "1999-01-01T00:00:00Z",
      updatedAt: "1999-01-01T00:00:00Z"
    },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "8. Immutable createdAt tampering on update",
    path: "/users/user_1/notes/note_1",
    operation: "update",
    auth: { uid: "user_1", email_verified: true },
    payload: { createdAt: "2020-01-01T00:00:00Z" },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "9. Document ID poisoning (>128 chars)",
    path: `/users/user_1/notes/${"x".repeat(200)}`,
    operation: "create",
    auth: { uid: "user_1", email_verified: true },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "10. Inline base64 injection into StudyNoteRecord.screenshots",
    path: "/users/user_1/notes/note_1",
    operation: "create",
    auth: { uid: "user_1", email_verified: true },
    payload: {
      screenshots: [`data:image/png;base64,${"A".repeat(4000)}`]
    },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "11. Oversized media payload exceeding 900KB safety cap",
    path: "/users/user_1/media/med_abc123",
    operation: "create",
    auth: { uid: "user_1", email_verified: true },
    payload: {
      mediaId: "med_abc123",
      ownerUid: "user_1",
      mimeType: "image/jpeg",
      dataUrl: `data:image/jpeg;base64,${"A".repeat(950000)}`,
      byteSize: 800000
    },
    expected: "PERMISSION_DENIED"
  },
  {
    name: "12. Orphaned subcollection write without parent workspace document",
    path: "/users/user_missing/goals/goal_1",
    operation: "create",
    auth: { uid: "user_missing", email_verified: true },
    expected: "PERMISSION_DENIED"
  }
];
