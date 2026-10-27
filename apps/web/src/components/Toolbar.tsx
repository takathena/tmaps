import {
  Bell,
  Cable,
  ChevronUp,
  Hand,
  Layers,
  MousePointer2,
  Router,
  Search,
  type LucideIcon,
} from "lucide-react";

export type ToolId =
  | "select"
  | "pan"
  | "add-device"
  | "add-cable"
  | "search"
  | "clustering"
  | "notifications"
  | "more";

type Tool = {
  id: ToolId;
  label: string;
  icon: LucideIcon;
};

const TOOLS: Tool[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "pan", label: "Pan", icon: Hand },
  { id: "add-device", label: "+ Perangkat", icon: Router },
  { id: "add-cable", label: "+ Kabel", icon: Cable },
  { id: "search", label: "Search", icon: Search },
  { id: "clustering", label: "Clustering", icon: Layers },
  { id: "notifications", label: "Notifikasi", icon: Bell },
];

const MORE_TOOL: Tool = { id: "more", label: "More", icon: ChevronUp };

type ToolbarProps = {
  activeTool: ToolId;
  clusteringEnabled: boolean;
  onSelect: (tool: ToolId) => void;
};

function ToolButton({
  tool,
  active,
  onSelect,
}: {
  tool: Tool;
  active: boolean;
  onSelect: (tool: ToolId) => void;
}) {
  const Icon = tool.icon;

  return (
    <button
      type="button"
      className="tool-button"
      data-active={active}
      data-tooltip={tool.label}
      aria-label={tool.label}
      aria-pressed={active}
      onClick={() => onSelect(tool.id)}
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

export function Toolbar({ activeTool, clusteringEnabled, onSelect }: ToolbarProps) {
  return (
    <div className="toolbar panel" role="toolbar" aria-label="Alat peta">
      {TOOLS.map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          active={tool.id === "clustering" ? clusteringEnabled : activeTool === tool.id}
          onSelect={onSelect}
        />
      ))}

      <span className="toolbar-divider" aria-hidden="true" />

      <ToolButton
        tool={MORE_TOOL}
        active={activeTool === MORE_TOOL.id}
        onSelect={onSelect}
      />
    </div>
  );
}
