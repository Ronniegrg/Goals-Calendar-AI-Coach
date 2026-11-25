import { GoalStepType, SessionSubStep, SubTask } from "../types";

export function isStepActive(step: { enabled?: boolean } | null | undefined): boolean {
  return step?.enabled !== false;
}

export function isKnowledgeTesterStep(
  step: { stepType?: GoalStepType; title?: string } | null | undefined
): boolean {
  if (!step) return false;
  return (
    step.stepType === "self_test" ||
    /knowledge[\s_-]*tester|self[\s_-]*test/i.test(step.title || "")
  );
}

export function reorderSteps<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length
  ) {
    return list;
  }
  const updated = [...list];
  const [moved] = updated.splice(fromIndex, 1);
  updated.splice(toIndex, 0, moved);
  return updated;
}

export function subTaskToSessionSubStep(s: SubTask): SessionSubStep {
  return {
    id: s.id,
    title: s.title,
    durationMinutes: s.durationMinutes || 15,
    completed: s.completed || false,
    enabled: s.enabled,
    stepType: s.stepType,
    assignedLinkNoteId: s.assignedLinkNoteId,
    assignedLinkUrl: s.assignedLinkUrl,
    assignedLinkTitle: s.assignedLinkTitle,
    lastTestScore: s.lastTestScore,
    carryoverNote: s.carryoverNote,
    carryoverNoteDate: s.carryoverNoteDate,
  };
}

export function sessionSubStepToSubTask(s: SessionSubStep): SubTask {
  return {
    id: s.id,
    title: s.title,
    durationMinutes: s.durationMinutes || 15,
    completed: s.completed || false,
    enabled: s.enabled,
    stepType: s.stepType,
    assignedLinkNoteId: s.assignedLinkNoteId,
    assignedLinkUrl: s.assignedLinkUrl,
    assignedLinkTitle: s.assignedLinkTitle,
    lastTestScore: s.lastTestScore,
    carryoverNote: s.carryoverNote,
    carryoverNoteDate: s.carryoverNoteDate,
  };
}
