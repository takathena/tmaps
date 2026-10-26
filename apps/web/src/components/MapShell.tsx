import { useState } from "react";
import { Brand } from "./Brand";
import { MainMenu } from "./MainMenu";
import { MapView } from "./MapView";
import { NotificationBell } from "./NotificationBell";
import { Toolbar, type ToolId } from "./Toolbar";

export function MapShell({ onLogout }: { onLogout: () => Promise<void> }) {
  const [activeTool, setActiveTool] = useState<ToolId>("select");

  return (
    <div className="app-shell" data-tool={activeTool}>
      <MapView />

      <div className="ui-overlay">
        <header className="panel overlay-top-left">
          <Brand />
          <MainMenu onLogout={onLogout} />
        </header>

        <div className="panel overlay-top-right">
          <NotificationBell />
        </div>

        <div className="overlay-bottom-center">
          <Toolbar activeTool={activeTool} onSelect={setActiveTool} />
        </div>
      </div>
    </div>
  );
}
