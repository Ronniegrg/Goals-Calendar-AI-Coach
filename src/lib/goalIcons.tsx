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
  RotateCw,
  Award,
  Bookmark,
  Camera,
  Coins,
  Cpu,
  Feather,
  Film,
  Glasses,
  Headphones,
  Key,
  Layers,
  Lightbulb,
  Mic,
  Mountain,
  Package,
  Pencil,
  Plane,
  Radio,
  Search,
  Server,
  Star,
  Timer,
  TrendingUp,
  Tv,
  Users,
  Wallet,
  Wrench,
  Bike,
  Crown,
  Droplet,
  Hourglass,
  ListTodo
} from "lucide-react";
import { GoalType } from "../types";

export interface GoalIconOption {
  id: string;
  label: string;
  category?: "fitness" | "study" | "tech" | "lifestyle" | "career" | "creativity";
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

export const GOAL_ICONS: GoalIconOption[] = [
  // Focus & General
  { id: "target", label: "Target Focus", category: "fitness", icon: Target },
  { id: "rocket", label: "Launch / Rocket", category: "career", icon: Rocket },
  { id: "flame", label: "Streak / Fire", category: "lifestyle", icon: Flame },
  { id: "zap", label: "Energy / Sprint", category: "lifestyle", icon: Zap },
  { id: "star", label: "Star / Milestone", category: "career", icon: Star },
  { id: "trophy", label: "Achievement", category: "career", icon: Trophy },
  { id: "award", label: "Award / Honor", category: "career", icon: Award },
  { id: "crown", label: "Mastery / Crown", category: "career", icon: Crown },
  { id: "check", label: "Tasks / To-do", category: "career", icon: CheckCircle },
  { id: "list_todo", label: "Checklist / Plan", category: "career", icon: ListTodo },
  { id: "timer", label: "Deep Timer / Pomodoro", category: "study", icon: Timer },
  { id: "hourglass", label: "Patience / Time", category: "study", icon: Hourglass },

  // Tech & Coding
  { id: "code", label: "Coding / Dev", category: "tech", icon: Code },
  { id: "terminal", label: "Terminal / CLI", category: "tech", icon: Terminal },
  { id: "laptop", label: "Projects / Tech", category: "tech", icon: Laptop },
  { id: "cpu", label: "Hardware / AI Core", category: "tech", icon: Cpu },
  { id: "server", label: "Backend / Infra", category: "tech", icon: Server },
  { id: "shield", label: "Cybersecurity / Defense", category: "tech", icon: Shield },
  { id: "sparkles", label: "AI / Smart Automation", category: "tech", icon: Sparkles },
  { id: "key", label: "Security / Crypto", category: "tech", icon: Key },
  { id: "layers", label: "Architecture / Stack", category: "tech", icon: Layers },

  // Fitness & Health
  { id: "dumbbell", label: "Gym / Strength", category: "fitness", icon: Dumbbell },
  { id: "activity", label: "Cardio / Heart Rate", category: "fitness", icon: Activity },
  { id: "bike", label: "Cycling / Outdoors", category: "fitness", icon: Bike },
  { id: "footprints", label: "Walking / Steps", category: "fitness", icon: Footprints },
  { id: "mountain", label: "Hiking / Climbing", category: "fitness", icon: Mountain },
  { id: "heart", label: "Health / Vitals", category: "fitness", icon: Heart },
  { id: "droplet", label: "Hydration / Water", category: "fitness", icon: Droplet },

  // Learning & Study
  { id: "book", label: "Study / Reading", category: "study", icon: BookOpen },
  { id: "graduation", label: "Education / Degree", category: "study", icon: GraduationCap },
  { id: "brain", label: "Brain / Cognition", category: "study", icon: Brain },
  { id: "lightbulb", label: "Ideas / Innovation", category: "study", icon: Lightbulb },
  { id: "pencil", label: "Writing / Notes", category: "study", icon: Pencil },
  { id: "bookmark", label: "Research / Syllabus", category: "study", icon: Bookmark },
  { id: "glasses", label: "Deep Reading / Analysis", category: "study", icon: Glasses },
  { id: "search", label: "Investigation / Search", category: "study", icon: Search },

  // Career & Finance
  { id: "briefcase", label: "Career / Work", category: "career", icon: Briefcase },
  { id: "trending_up", label: "Growth / Analytics", category: "career", icon: TrendingUp },
  { id: "wallet", label: "Budget / Wealth", category: "career", icon: Wallet },
  { id: "coins", label: "Investments / Revenue", category: "career", icon: Coins },
  { id: "users", label: "Networking / Team", category: "career", icon: Users },
  { id: "globe", label: "Languages / Global", category: "career", icon: Globe },

  // Creativity & Media
  { id: "palette", label: "Design / Art", category: "creativity", icon: Palette },
  { id: "music", label: "Music / Practice", category: "creativity", icon: Music },
  { id: "headphones", label: "Audiobooks / Podcasts", category: "creativity", icon: Headphones },
  { id: "camera", label: "Photography / Video", category: "creativity", icon: Camera },
  { id: "film", label: "Filmmaking / Media", category: "creativity", icon: Film },
  { id: "mic", label: "Speaking / Singing", category: "creativity", icon: Mic },
  { id: "feather", label: "Journaling / Poetry", category: "creativity", icon: Feather },

  // Lifestyle & Daily Habits
  { id: "coffee", label: "Coffee / Routine", category: "lifestyle", icon: Coffee },
  { id: "sun", label: "Morning Routine", category: "lifestyle", icon: Sun },
  { id: "moon", label: "Sleep / Night Routine", category: "lifestyle", icon: Moon },
  { id: "compass", label: "Life / Exploration", category: "lifestyle", icon: Compass },
  { id: "plane", label: "Travel / Adventure", category: "lifestyle", icon: Plane },
  { id: "package", label: "Organization / Chores", category: "lifestyle", icon: Package },
  { id: "wrench", label: "Maintenance / DIY", category: "lifestyle", icon: Wrench },
  { id: "tv", label: "Media / Relaxation", category: "lifestyle", icon: Tv },
  { id: "smile", label: "Personal Life / Social", category: "lifestyle", icon: Smile }
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
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCat, setSelectedCat] = React.useState<string>("all");

  const categories = [
    { id: "all", label: "All Icons" },
    { id: "tech", label: "Tech" },
    { id: "fitness", label: "Fitness" },
    { id: "study", label: "Study" },
    { id: "career", label: "Career" },
    { id: "creativity", label: "Creative" },
    { id: "lifestyle", label: "Habits" }
  ];

  const filteredIcons = GOAL_ICONS.filter((opt) => {
    const matchesCategory = selectedCat === "all" || opt.category === selectedCat;
    const matchesSearch = !searchQuery.trim() || opt.label.toLowerCase().includes(searchQuery.toLowerCase()) || opt.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
          Choose Goal Icon ({filteredIcons.length} available)
        </label>
        <div className="relative w-36">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search icon..."
            className="w-full text-[10.5px] px-2 py-0.5 bg-black/40 border border-white/10 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCat(cat.id)}
            className={`text-[9.5px] px-2 py-0.5 rounded-md font-semibold whitespace-nowrap transition cursor-pointer ${
              selectedCat === cat.id
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-7 sm:grid-cols-10 gap-1.5 p-2 bg-[#020205]/40 border border-white/10 rounded-xl max-h-40 overflow-y-auto custom-scrollbar">
        {filteredIcons.map((opt) => {
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
        {filteredIcons.length === 0 && (
          <div className="col-span-full py-4 text-center text-slate-500 text-xs">
            No icons found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}
