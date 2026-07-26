import React from "react";
import { 
  Target, 
  Dumbbell, 
  Activity, 
  BookOpen, 
  Briefcase, 
  Code, 
  Sparkles, 
  Heart, 
  Flame, 
  Laptop, 
  GraduationCap, 
  Trophy, 
  Sun, 
  Moon, 
  Coffee, 
  Music, 
  Palette, 
  Footprints, 
  Brain, 
  Smile, 
  CheckCircle,
  Zap,
  Shield,
  Globe,
  Compass,
  Terminal,
  Rocket,
  RotateCw
} from "lucide-react";
import { GoalType } from "../types";

export interface GoalIconOption {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

export const GOAL_ICONS: GoalIconOption[] = [
  { id: "target", label: "Target Focus", icon: Target },
  { id: "shield", label: "Cybersecurity / Defense", icon: Shield },
  { id: "code", label: "Coding / Dev", icon: Code },
  { id: "terminal", label: "Terminal / CLI", icon: Terminal },
  { id: "book", label: "Study / Reading", icon: BookOpen },
  { id: "dumbbell", label: "Fitness / Gym", icon: Dumbbell },
  { id: "activity", label: "Activity / Cardio", icon: Activity },
  { id: "graduation", label: "Education", icon: GraduationCap },
  { id: "briefcase", label: "Career / Work", icon: Briefcase },
  { id: "laptop", label: "Projects / Tech", icon: Laptop },
  { id: "rocket", label: "Launch / Goals", icon: Rocket },
  { id: "flame", label: "Streak / Fire", icon: Flame },
  { id: "zap", label: "Energy / Sprint", icon: Zap },
  { id: "sparkles", label: "AI / Magic", icon: Sparkles },
  { id: "brain", label: "Mental / Mind", icon: Brain },
  { id: "heart", label: "Health / Wellness", icon: Heart },
  { id: "trophy", label: "Achievement", icon: Trophy },
  { id: "footprints", label: "Running / Walking", icon: Footprints },
  { id: "sun", label: "Morning Routine", icon: Sun },
  { id: "moon", label: "Evening Habit", icon: Moon },
  { id: "coffee", label: "Productivity", icon: Coffee },
  { id: "music", label: "Audio / Focus", icon: Music },
  { id: "palette", label: "Design / Art", icon: Palette },
  { id: "globe", label: "Languages / Web", icon: Globe },
  { id: "compass", label: "Life / Exploration", icon: Compass },
  { id: "smile", label: "Personal Life", icon: Smile },
  { id: "check", label: "Tasks / To-do", icon: CheckCircle }
];

export function renderGoalIcon(
  iconId?: string, 
  type?: GoalType | string, 
  className: string = "w-4 h-4 shrink-0", 
  style?: React.CSSProperties
) {
  if (iconId) {
    const match = GOAL_ICONS.find((item) => item.id === iconId);
    if (match) {
      const IconComp = match.icon;
      return <IconComp className={className} style={style} />;
    }
  }

  // Fallback by type
  switch (type) {
    case GoalType.WORKOUT:
    case "workout":
      return <Activity className={className} style={style} />;
    case GoalType.STUDY:
    case "study":
      return <BookOpen className={className} style={style} />;
    case GoalType.JOB_SEARCH:
    case "job_search":
      return <Briefcase className={className} style={style} />;
    case GoalType.SIDE_PROJECT:
    case "side_project":
      return <Laptop className={className} style={style} />;
    case GoalType.ROUTINE:
    case "routine":
      return <RotateCw className={className} style={style} />;
    case GoalType.PERSONAL:
    case "personal":
      return <Smile className={className} style={style} />;
    default:
      return <Target className={className} style={style} />;
  }
}

interface GoalIconPickerProps {
  selectedIcon: string;
  onSelectIcon: (iconId: string) => void;
  accentColor?: string;
}

export function GoalIconPicker({ selectedIcon, onSelectIcon, accentColor = "#6366f1" }: GoalIconPickerProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
        Choose Goal Icon
      </label>
      <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 p-2 bg-[#020205]/40 border border-white/10 rounded-xl max-h-36 overflow-y-auto custom-scrollbar">
        {GOAL_ICONS.map((opt) => {
          const IconComp = opt.icon;
          const isSelected = selectedIcon === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectIcon(opt.id)}
              className={`p-2 rounded-lg flex items-center justify-center transition cursor-pointer ${
                isSelected
                  ? "text-white shadow-md ring-2 ring-white scale-105"
                  : "bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white"
              }`}
              title={opt.label}
              style={{ backgroundColor: isSelected ? accentColor : undefined }}
            >
              <IconComp className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
