import { X, Filter as FilterIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api, errorMessage, type DeviceType, type DeviceTag } from "../lib/api";

type FilterPanelProps = {
  activeFilters: Array<{ type: "deviceType" | "tag"; id: string; name: string }>;
  onFilterAdd: (type: "deviceType" | "tag", id: string, name: string) => void;
  onFilterRemove: (type: "deviceType" | "tag", id: string) => void;
  onClose: () => void;
};

export function FilterPanel({ activeFilters, onFilterAdd, onFilterRemove, onClose }: FilterPanelProps) {
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [tags, setTags] = useState<DeviceTag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [typesRes, tagsRes] = await Promise.all([
          api.getDeviceTypes(),
          api.getTags(),
        ]);
        setDeviceTypes(typesRes.deviceTypes);
        setTags(tagsRes.tags);
      } catch (error) {
        console.error("Load filters failed:", errorMessage(error));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function isActive(type: "deviceType" | "tag", id: string): boolean {
    return activeFilters.some((f) => f.type === type && f.id === id);
  }

  function toggle(type: "deviceType" | "tag", id: string, name: string) {
    if (isActive(type, id)) {
      onFilterRemove(type, id);
    } else {
      onFilterAdd(type, id, name);
    }
  }

  return (
    <div className="filter-panel panel">
      <div className="filter-panel-header">
        <div className="filter-panel-title">
          <FilterIcon size={20} strokeWidth={2} aria-hidden="true" />
          <h3>Filter</h3>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Tutup filter"
          onClick={onClose}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="filter-panel-body">
        {loading ? (
          <div className="filter-empty">Memuat...</div>
        ) : (
          <>
            <div className="filter-group">
              <div className="filter-group-label">Tipe Perangkat</div>
              <div className="filter-items">
                {deviceTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className="filter-item"
                    data-active={isActive("deviceType", type.id)}
                    onClick={() => toggle("deviceType", type.id, type.name)}
                  >
                    {type.name}
                  </button>
                ))}
              </div>
            </div>

            {tags.length > 0 ? (
              <div className="filter-group">
                <div className="filter-group-label">Tag</div>
                <div className="filter-items">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className="filter-item"
                      data-active={isActive("tag", tag.id)}
                      onClick={() => toggle("tag", tag.id, tag.name)}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
