'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { siteFetch } from '@/store/siteFetch';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';

type BannerVersionMeta = {
  _id: string;
  version: number;
  publishedAt: string;
};

const VersionHistory = () => {
  const searchParams = useSearchParams();
  const bannerId = searchParams?.get('bannerId');
  const [versions, setVersions] = useState<BannerVersionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (!bannerId) {
      return;
    }

    setLoading(true);
    try {
      const response = await siteFetch(`/api/banners/${bannerId}/versions`);
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload?.msg || 'Unable to load version history');
        return;
      }
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
    } catch (error) {
      console.error('VersionHistory load error', error);
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [bannerId]);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  const restoreVersion = async (versionId: string) => {
    if (!bannerId) {
      toast.error('Missing bannerId in URL');
      return;
    }

    setRestoringId(versionId);
    try {
      const response = await siteFetch(`/api/banners/${bannerId}/versions/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload?.msg || 'Unable to restore version');
        return;
      }
      toast.success('Version restored — reload the banner to see it');
      await loadVersions();
    } catch (error) {
      console.error('VersionHistory restore error', error);
      toast.error('Failed to restore version');
    } finally {
      setRestoringId(null);
    }
  };

  if (!bannerId) {
    return null;
  }

  return (
    <div className="relative text-xs text-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-sm border border-neutral-300 bg-white px-2 py-1 text-neutral-800 hover:bg-neutral-200"
      >
        Versions
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-sm border border-neutral-300 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Version history</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-neutral-600 hover:text-neutral-800"
            >
              Close
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-neutral-600">Loading…</div>
          ) : sortedVersions.length === 0 ? (
            <div className="text-sm text-neutral-600">No published versions</div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {sortedVersions.map((version) => (
                <div
                  key={version._id}
                  className="rounded-sm border border-neutral-200 bg-neutral-100 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">Version {version.version}</div>
                      <div className="text-[11px] text-neutral-600">
                        {new Date(version.publishedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={restoringId === version._id}
                      onClick={() => restoreVersion(version._id)}
                      className="rounded-sm bg-neutral-200 px-2 py-1 text-[11px] text-neutral-800 hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {restoringId === version._id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VersionHistory;
