import { useState } from "react";
import type { AuthUser } from "../lib/api";
import { Brand } from "./Brand";
import { CatalogPanel, type CatalogTab } from "./CatalogPanel";
import { MainMenu } from "./MainMenu";
import { MapView } from "./MapView";
import { NotificationBell } from "./NotificationBell";
import { Toolbar, type ToolId } from "./Toolbar";

type MapShellProps = {
  user: AuthUser;
  onLogout: () => Promise<void>;
};

export function MapShell({ user, onLogout }: MapShellProps) {
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [catalogTab, setCatalogTab] = useState<CatalogTab | null>(null);

  return (
    <div className="app-shell" data-tool={activeTool}>
      <MapView />

      <div className="ui-overlay">
        <header className="panel overlay-top-left">
          <Brand />
          <MainMenu
            onLogout={onLogout}
            onOpenCatalog={(tab) => setCatalogTab(tab)}
          />
        </header>

        <div className="panel overlay-top-right">
          <NotificationBell />
        </div>

        {catalogTab ? (
          <CatalogPanel
            user={user}
            tab={catalogTab}
            onTabChange={(tab) => setCatalogTab(tab)}
            onClose={() => setCatalogTab(null)}
          />
        ) : null}

        <div className="overlay-bottom-center">
          <Toolbar activeTool={activeTool} onSelect={setActiveTool} />
        </div>
      </div>
    </div>
  );
}
