import { Network } from "lucide-react";

export function Brand() {
  return (
    <div className="brand" aria-label="TMaps">
      <span className="brand-mark" aria-hidden="true">
        <Network size={20} strokeWidth={2} />
      </span>
      <span className="brand-name">TMaps</span>
    </div>
  );
}
