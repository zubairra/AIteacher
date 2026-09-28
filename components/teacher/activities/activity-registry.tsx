'use client';
import type { ComponentType } from 'react';
import type { NativeActivityDefinition, NativeActivityType } from '@/lib/teacher/native-activities';
import { QuestionActivity } from './QuestionActivity';
import { MatchPairsActivity } from './MatchPairsActivity';
import { SortOrderingActivity } from './SortOrderingActivity';
import { WheelActivity } from './WheelActivity';
import { TeamBattleActivity } from './TeamBattleActivity';
export interface ActivityRendererProps {
  definition: NativeActivityDefinition;
  resetToken: number;
}
export interface ActivityRegistration {
  type: NativeActivityType;
  renderer: ComponentType<ActivityRendererProps>;
  supportsPowerUps: boolean;
}
const entries: ActivityRegistration[] = [
  { type: 'multiple-choice', renderer: QuestionActivity, supportsPowerUps: true },
  { type: 'true-false', renderer: QuestionActivity, supportsPowerUps: true },
  { type: 'match-pairs', renderer: MatchPairsActivity, supportsPowerUps: false },
  { type: 'sort', renderer: SortOrderingActivity, supportsPowerUps: false },
  { type: 'ordering', renderer: SortOrderingActivity, supportsPowerUps: false },
  { type: 'spin-wheel', renderer: WheelActivity, supportsPowerUps: false },
  { type: 'team-battle', renderer: TeamBattleActivity, supportsPowerUps: true },
];
export const activityRegistry = new Map(entries.map((entry) => [entry.type, entry]));
export function getActivityRegistration(type: NativeActivityType) {
  return activityRegistry.get(type);
}
