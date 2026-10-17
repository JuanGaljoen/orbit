import {
  Bot,
  FolderKanban,
  GitBranch,
  Lightbulb,
  LayoutDashboard,
  ListTodo,
  Map,
  Settings,
  SquareKanban,
  Target,
} from "lucide-react";

/** `shortcut` is the second key of a `g <key>` chord. */
export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, shortcut: "d" },
  { href: "/tickets", label: "Tickets", icon: ListTodo, shortcut: "t" },
  { href: "/board", label: "Board", icon: SquareKanban, shortcut: "b" },
  { href: "/projects", label: "Projects", icon: FolderKanban, shortcut: "p" },
  { href: "/objectives", label: "Objectives", icon: Target, shortcut: "o" },
  { href: "/roadmap", label: "Roadmap", icon: Map, shortcut: "r" },
  { href: "/insights", label: "Insights", icon: Lightbulb, shortcut: "i" },
  { href: "/assistant", label: "Assistant", icon: Bot, shortcut: "a" },
  { href: "/github", label: "GitHub", icon: GitBranch, shortcut: "g" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "s" },
] as const;
