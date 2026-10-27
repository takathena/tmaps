import { Search as SearchIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type SearchResults } from "../lib/api";

type SearchPanelProps = {
  onDeviceSelect: (deviceId: string) => void;
  onFilterAdd: (type: "deviceType" | "tag", id: string, name: string) => void;
  onClose: () => void;
};

export function SearchPanel({ onDeviceSelect, onFilterAdd, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      return;
    }

    setLoading(true);
    try {
      const response = await api.search(q);
      setResults(response.results);
    } catch (error) {
      console.error("Search failed:", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);

    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = window.setTimeout(() => {
      void search(value);
    }, 300);
  }

  function handleDeviceClick(deviceId: string) {
    onDeviceSelect(deviceId);
    onClose();
  }

  function handleTypeClick(id: string, name: string) {
    onFilterAdd("deviceType", id, name);
    onClose();
  }

  function handleTagClick(id: string, name: string) {
    onFilterAdd("tag", id, name);
    onClose();
  }

  const hasResults = results && (results.devices.length > 0 || results.types.length > 0 || results.tags.length > 0);

  return (
    <div className="search-panel panel">
      <div className="search-panel-header">
        <div className="search-input-wrapper">
          <SearchIcon size={20} strokeWidth={2} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Cari perangkat, tipe, atau tag..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Tutup pencarian"
          onClick={onClose}
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="search-panel-body">
        {loading ? (
          <div className="search-empty">Mencari...</div>
        ) : query.length < 2 ? (
          <div className="search-empty">Ketik minimal 2 karakter untuk mencari</div>
        ) : !hasResults ? (
          <div className="search-empty">Tidak ada hasil</div>
        ) : (
          <div className="search-results">
            {results.devices.length > 0 ? (
              <div className="search-group">
                <div className="search-group-label">Perangkat</div>
                <ul className="search-list">
                  {results.devices.map((device) => (
                    <li key={device.id}>
                      <button
                        type="button"
                        className="search-item"
                        onClick={() => handleDeviceClick(device.id)}
                      >
                        <div className="search-item-main">
                          <span className="search-item-name">{device.name}</span>
                          <span className="search-item-meta">
                            {device.vendor} {device.modelName} · {device.typeName}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {results.types.length > 0 ? (
              <div className="search-group">
                <div className="search-group-label">Tipe Perangkat</div>
                <ul className="search-list">
                  {results.types.map((type) => (
                    <li key={type.id}>
                      <button
                        type="button"
                        className="search-item"
                        onClick={() => handleTypeClick(type.id, type.name)}
                      >
                        <span className="search-item-name">{type.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {results.tags.length > 0 ? (
              <div className="search-group">
                <div className="search-group-label">Tag</div>
                <ul className="search-list">
                  {results.tags.map((tag) => (
                    <li key={tag.id}>
                      <button
                        type="button"
                        className="search-item"
                        onClick={() => handleTagClick(tag.id, tag.name)}
                      >
                        <span className="search-item-name">{tag.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
