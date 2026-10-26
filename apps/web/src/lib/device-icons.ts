import {
  Antenna,
  Boxes,
  Cable,
  CircleDot,
  Network,
  RadioTower,
  Router,
  Server,
  Split,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export type DeviceIconOption = {
  value: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Nilai `icon` disimpan sebagai nama komponen lucide agar katalog tetap
 * portabel. Fallback ke Boxes bila nama tidak dikenal.
 */
export const DEVICE_ICON_OPTIONS: DeviceIconOption[] = [
  { value: "Router", label: "Router", icon: Router },
  { value: "RadioTower", label: "OLT", icon: RadioTower },
  { value: "Network", label: "Switch", icon: Network },
  { value: "Server", label: "Server", icon: Server },
  { value: "Wifi", label: "Access Point", icon: Wifi },
  { value: "Boxes", label: "ODP / ODC", icon: Boxes },
  { value: "Split", label: "Splitter", icon: Split },
  { value: "Cable", label: "Kabel", icon: Cable },
  { value: "Antenna", label: "Antena", icon: Antenna },
  { value: "CircleDot", label: "Lainnya", icon: CircleDot },
];

const ICON_MAP = new Map(DEVICE_ICON_OPTIONS.map((option) => [option.value, option.icon]));

export function getDeviceIcon(name: string | null | undefined): LucideIcon {
  return ICON_MAP.get(name ?? "") ?? Boxes;
}
