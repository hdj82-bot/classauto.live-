"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
  displayStyle,
  tabularStyle,
} from "@/components/professor/shell";
import LectureCard, {
  type LectureCardData,
} from "@/components/professor/LectureCard";

interface Course {
  id: string;
  title: string;
}

interface Lecture extends LectureCardData {
  slug: string;
  folder_id?: string | null;
  course_id: string;
  created_at?: string | null;
}

interface Folder {
  id: string;
  name: string;
  order: number;
  lecture_count: number;
}

const UNCATEGORIZED = "__uncategorized__";

/**
 * /professor/lectures — 강의 보관함.
 *
 * 사용자가 만든 모든 강의를 한 곳에서 보고, 폴더로 묶어 관리한다. 폴더는
 * 강의의 옵션 컬렉션(`lectures.folder_id`) — 강좌(Course) 와는 독립적이다.
 *
 * 좌측: 폴더 사이드바 (전체 / 미분류 / 사용자 폴더). 우측: 선택된 폴더의
 * 강의 카드 그리드. 카드는 대시보드와 동일한 `LectureCard` ([이어서 제작]
 * [삭제]) 를 재사용.
 */
export default function LectureLibraryPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { toast } = useToast();

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);
  const [movingLecture, setMovingLecture] = useState<Lecture | null>(null);

  // 세 단계(/api/courses → /api/folders → /api/courses/{id}/lectures) 중 어디서
  // 실패했는지 콘솔에서 식별 가능하도록 단계별 try/catch 로 쪼개고, 단계별
  // 회복 가능성에 따라 격리한다:
  //   - courses 실패 → 보관함 자체가 불가능 → 에러 화면.
  //   - folders 실패 → 폴더 메타만 비우고 강의 목록은 계속 로딩 (degrade).
  //   - lectures(course 단위) 실패 → 해당 course 만 스킵 (best-effort).
  const reloadAll = useCallback(async () => {
    setError(null);

    const [coursesResult, foldersResult] = await Promise.allSettled([
      api.get<Course[]>("/api/courses"),
      api.get<Folder[]>("/api/folders"),
    ]);

    if (coursesResult.status === "rejected") {
      console.error(
        "[library] GET /api/courses failed:",
        coursesResult.reason,
      );
      setError(t("library.loadError"));
      setLoading(false);
      return;
    }

    let fs: Folder[] = [];
    if (foldersResult.status === "rejected") {
      console.error(
        "[library] GET /api/folders failed:",
        foldersResult.reason,
      );
      toast(t("library.loadError"), "error");
    } else {
      fs = foldersResult.value.data;
    }

    const cs = coursesResult.value.data;
    const allLectures: Lecture[] = [];
    for (const c of cs) {
      try {
        const { data: lecs } = await api.get<Lecture[]>(
          `/api/courses/${c.id}/lectures`,
        );
        allLectures.push(...lecs);
      } catch (e) {
        console.error(
          `[library] GET /api/courses/${c.id}/lectures failed:`,
          e,
        );
      }
    }

    setLectures(allLectures);
    setFolders(fs);
    setLoading(false);
  }, [t, toast]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const filteredLectures = useMemo(() => {
    let list = lectures;
    if (activeFolder === UNCATEGORIZED) {
      list = list.filter((l) => !l.folder_id);
    } else if (activeFolder) {
      list = list.filter((l) => l.folder_id === activeFolder);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((l) => l.title.toLowerCase().includes(q));
    }
    return list;
  }, [lectures, activeFolder, search]);

  const uncategorizedCount = useMemo(
    () => lectures.filter((l) => !l.folder_id).length,
    [lectures],
  );

  const handleContinue = useCallback(
    (id: string) => {
      const lec = lectures.find((l) => l.id === id);
      if (!lec) return;
      const isProduction =
        !lec.is_published && (Boolean(lec.pipeline_task_id) || !lec.video_url);
      if (isProduction) {
        router.push(`/professor/studio?lecture=${id}`);
      } else {
        router.push(`/professor/lecture/${id}`);
      }
    },
    [lectures, router],
  );

  const handleDeleted = useCallback(
    (id: string) => {
      // 삭제된 강의가 폴더에 속해 있었다면 해당 폴더의 lecture_count 를 1 감소.
      // 안 그러면 "전체 강의 2 / 어흥 폴더 4" 같은 어긋난 카운트가 표시됨.
      const lec = lectures.find((l) => l.id === id);
      if (lec?.folder_id) {
        setFolders((fs) =>
          fs.map((f) =>
            f.id === lec.folder_id
              ? { ...f, lecture_count: Math.max(0, f.lecture_count - 1) }
              : f,
          ),
        );
      }
      setLectures((prev) => prev.filter((l) => l.id !== id));
    },
    [lectures],
  );

  const handleCreateFolder = async () => {
    const name = window.prompt(t("library.newFolderPlaceholder"));
    if (!name || !name.trim()) return;
    try {
      const { data } = await api.post<Folder>("/api/folders", {
        name: name.trim(),
        order: folders.length,
      });
      setFolders((prev) => [...prev, { ...data, lecture_count: 0 }]);
      toast(t("library.folderCreated"), "success");
    } catch {
      toast(t("library.folderCreateError"), "error");
    }
  };

  const handleRenameFolder = async (folder: Folder, newName: string) => {
    try {
      await api.patch(`/api/folders/${folder.id}`, { name: newName });
      setFolders((prev) =>
        prev.map((f) => (f.id === folder.id ? { ...f, name: newName } : f)),
      );
      toast(t("library.folderRenamed"), "success");
    } catch {
      toast(t("library.folderRenameError"), "error");
    } finally {
      setRenamingFolder(null);
    }
  };

  const handleDeleteFolder = async (folder: Folder) => {
    try {
      await api.delete(`/api/folders/${folder.id}`);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setLectures((prev) =>
        prev.map((l) =>
          l.folder_id === folder.id ? { ...l, folder_id: null } : l,
        ),
      );
      if (activeFolder === folder.id) setActiveFolder(null);
      toast(t("library.folderDeleted"), "success");
    } catch {
      toast(t("library.folderDeleteError"), "error");
    } finally {
      setDeletingFolder(null);
    }
  };

  const handleMoveLecture = async (
    lecture: Lecture,
    folderId: string | null,
  ) => {
    try {
      await api.patch(`/api/lectures/${lecture.id}/folder`, {
        folder_id: folderId,
      });
      setLectures((prev) =>
        prev.map((l) =>
          l.id === lecture.id ? { ...l, folder_id: folderId } : l,
        ),
      );
      setFolders((prev) =>
        prev.map((f) => {
          let delta = 0;
          if (lecture.folder_id === f.id) delta -= 1;
          if (folderId === f.id) delta += 1;
          return delta
            ? { ...f, lecture_count: Math.max(0, f.lecture_count + delta) }
            : f;
        }),
      );
      toast(t("library.moveSuccess"), "success");
    } catch {
      toast(t("library.moveError"), "error");
    } finally {
      setMovingLecture(null);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen label={t("library.pageTitle")} />;
  }

  if (error) {
    return (
      <PageContainer width="narrow">
        <Card padding={32} radius={18}>
          <div className="text-center" role="alert">
            <h2 style={{ ...displayStyle, fontSize: 22, marginBottom: 12 }}>
              {t("library.loadError")}
            </h2>
            <PrimaryButton
              variant="primary"
              size="md"
              onClick={() => window.location.reload()}
            >
              {t("common.retry")}
            </PrimaryButton>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="ClassAuto"
        title={t("library.pageTitle")}
        subtitle={t("library.pageSubtitle")}
        actions={
          <>
            <button
              type="button"
              onClick={() => router.push("/professor/dashboard")}
              className="hidden sm:inline-flex items-center rounded-lg motion-safe:transition"
              style={{
                padding: "8px 14px",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--text-muted)",
                background: "transparent",
                border: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              ← {t("library.back")}
            </button>
            <PrimaryButton
              variant="primary"
              size="md"
              onClick={handleCreateFolder}
            >
              + {t("library.newFolder")}
            </PrimaryButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
        {/* 폴더 사이드바 */}
        <aside>
          <Card padding={14} radius={14}>
            <FolderRow
              label={t("library.allLectures")}
              count={lectures.length}
              active={activeFolder === null}
              onClick={() => setActiveFolder(null)}
            />
            <FolderRow
              label={t("library.uncategorized")}
              count={uncategorizedCount}
              active={activeFolder === UNCATEGORIZED}
              onClick={() => setActiveFolder(UNCATEGORIZED)}
            />
            <div
              style={{
                margin: "8px 0",
                borderTop: "1px solid var(--line)",
              }}
            />
            {folders.length === 0 ? (
              <p
                style={{
                  margin: "8px 4px",
                  fontSize: 11.5,
                  color: "var(--text-faint)",
                }}
              >
                {t("library.newFolderPlaceholder")}
              </p>
            ) : (
              folders.map((f) => (
                <FolderRow
                  key={f.id}
                  label={f.name}
                  count={f.lecture_count}
                  active={activeFolder === f.id}
                  onClick={() => setActiveFolder(f.id)}
                  onRename={() => setRenamingFolder(f)}
                  onDelete={() => setDeletingFolder(f)}
                />
              ))
            )}
          </Card>
        </aside>

        {/* 강의 그리드 */}
        <section>
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 14, gap: 12 }}
          >
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("library.searchPlaceholder")}
              className="rounded-lg"
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: 13,
                background: "var(--bg-subtle)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                outline: "none",
              }}
            />
            <span
              style={{
                ...tabularStyle,
                fontSize: 11.5,
                color: "var(--text-subtle)",
                whiteSpace: "nowrap",
              }}
            >
              {t("library.countLectures", {
                count: filteredLectures.length,
              })}
            </span>
          </div>

          {filteredLectures.length === 0 ? (
            <Card padding={32} radius={14}>
              <p
                className="text-center"
                style={{ color: "var(--text-muted)", margin: 0 }}
              >
                {t("library.empty")}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredLectures.map((lec) => (
                <div key={lec.id} className="relative">
                  <LectureCard
                    lecture={lec}
                    onContinue={handleContinue}
                    onDeleted={handleDeleted}
                  />
                  <button
                    type="button"
                    onClick={() => setMovingLecture(lec)}
                    aria-label={t("library.moveTo")}
                    className="absolute top-3 right-3 rounded-md motion-safe:transition"
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--text-muted)",
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--line)",
                      cursor: "pointer",
                    }}
                  >
                    {t("library.moveTo")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <RenameFolderModal
        folder={renamingFolder}
        onClose={() => setRenamingFolder(null)}
        onConfirm={handleRenameFolder}
      />
      <DeleteFolderModal
        folder={deletingFolder}
        onClose={() => setDeletingFolder(null)}
        onConfirm={handleDeleteFolder}
      />
      <MoveLectureModal
        lecture={movingLecture}
        folders={folders}
        onClose={() => setMovingLecture(null)}
        onConfirm={handleMoveLecture}
      />
    </PageContainer>
  );
}

function FolderRow({
  label,
  count,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg motion-safe:transition"
      style={{
        padding: "6px 8px",
        background: active ? "var(--gold-soft)" : "transparent",
        color: active ? "var(--gold)" : "var(--text-muted)",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex-1 text-left"
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
          padding: "2px 0",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}>
          {label}
        </span>
        <span
          style={{
            ...tabularStyle,
            marginLeft: 6,
            fontSize: 11,
            color: "var(--text-faint)",
          }}
        >
          {count}
        </span>
      </button>
      {onRename && (
        <button
          type="button"
          onClick={onRename}
          aria-label="rename"
          style={{
            padding: "2px 4px",
            fontSize: 11,
            color: "var(--text-faint)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          ✎
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="delete"
          style={{
            padding: "2px 4px",
            fontSize: 11,
            color: "var(--text-faint)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function RenameFolderModal({
  folder,
  onClose,
  onConfirm,
}: {
  folder: Folder | null;
  onClose: () => void;
  onConfirm: (folder: Folder, name: string) => void;
}) {
  if (!folder) return null;
  // Folder 가 바뀔 때마다 새 인스턴스로 다시 마운트되도록 key 분리.
  return (
    <RenameFolderModalBody
      key={folder.id}
      folder={folder}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function RenameFolderModalBody({
  folder,
  onClose,
  onConfirm,
}: {
  folder: Folder;
  onClose: () => void;
  onConfirm: (folder: Folder, name: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(folder.name);
  return (
    <Modal open={true} onClose={onClose} title={t("library.folderRenameTitle")}>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg"
        style={{
          padding: "8px 12px",
          marginBottom: 16,
          fontSize: 13,
          background: "var(--bg-subtle)",
          border: "1px solid var(--line)",
          color: "var(--text)",
        }}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid var(--line)",
          }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={!name.trim() || name.trim() === folder.name}
          onClick={() => onConfirm(folder, name.trim())}
          className="rounded-lg"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "var(--gold)",
            border: "1px solid var(--gold)",
            opacity: !name.trim() || name.trim() === folder.name ? 0.5 : 1,
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </Modal>
  );
}

function DeleteFolderModal({
  folder,
  onClose,
  onConfirm,
}: {
  folder: Folder | null;
  onClose: () => void;
  onConfirm: (folder: Folder) => void;
}) {
  const { t } = useI18n();
  if (!folder) return null;
  return (
    <Modal open={true} onClose={onClose} title={t("library.folderDeleteTitle")}>
      <p style={{ color: "var(--text-muted)", marginBottom: 18 }}>
        {t("library.folderDeleteBody", { name: folder.name })}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid var(--line)",
          }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(folder)}
          className="rounded-lg"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "var(--danger, #b91c1c)",
            border: "1px solid var(--danger, #b91c1c)",
          }}
        >
          {t("common.delete")}
        </button>
      </div>
    </Modal>
  );
}

// 미분류 옵션을 동일 셀렉트 모델에 담기 위한 sentinel.
// (null 은 "선택 없음" 과 구별이 어려워 명시적 문자열을 쓴다.)
const UNCATEGORIZED_VALUE = "__uncategorized__";

function MoveLectureModal({
  lecture,
  folders,
  onClose,
  onConfirm,
}: {
  lecture: Lecture | null;
  folders: Folder[];
  onClose: () => void;
  onConfirm: (lecture: Lecture, folderId: string | null) => void;
}) {
  if (!lecture) return null;
  // lecture 가 바뀌면 새 인스턴스로 마운트되어 selected 가 새 lecture 기준으로 초기화.
  return (
    <MoveLectureModalBody
      key={lecture.id}
      lecture={lecture}
      folders={folders}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function MoveLectureModalBody({
  lecture,
  folders,
  onClose,
  onConfirm,
}: {
  lecture: Lecture;
  folders: Folder[];
  onClose: () => void;
  onConfirm: (lecture: Lecture, folderId: string | null) => void;
}) {
  const { t } = useI18n();
  const currentSelection = lecture.folder_id ?? UNCATEGORIZED_VALUE;
  const [selected, setSelected] = useState<string>(currentSelection);

  // 현재 폴더와 동일하면 confirm 비활성 (이동할 변화가 없음).
  const canConfirm = selected !== currentSelection;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(
      lecture,
      selected === UNCATEGORIZED_VALUE ? null : selected,
    );
  };

  const renderOption = (
    value: string,
    label: string,
    count?: number,
  ) => {
    const isSelected = selected === value;
    const isCurrent = currentSelection === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setSelected(value)}
        className="rounded-lg text-left motion-safe:transition"
        style={{
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: isSelected ? 600 : 500,
          color: isSelected ? "var(--gold)" : "var(--text)",
          background: isSelected ? "var(--gold-soft)" : "var(--bg-subtle)",
          border: `1px solid ${
            isSelected ? "var(--gold-medium)" : "var(--line)"
          }`,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (isSelected) return;
          e.currentTarget.style.background = "var(--bg-hover)";
          e.currentTarget.style.borderColor = "var(--gold-medium)";
        }}
        onMouseLeave={(e) => {
          if (isSelected) return;
          e.currentTarget.style.background = "var(--bg-subtle)";
          e.currentTarget.style.borderColor = "var(--line)";
        }}
      >
        {label}
        {count !== undefined && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            ({count})
          </span>
        )}
        {isCurrent && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            · {t("library.currentLocation")}
          </span>
        )}
      </button>
    );
  };

  return (
    <Modal open={true} onClose={onClose} title={t("library.moveToFolderTitle")}>
      <p style={{ color: "var(--text-muted)", marginBottom: 14 }}>
        {t("library.moveToFolderBody", { title: lecture.title })}
      </p>
      <div className="flex flex-col gap-2" style={{ marginBottom: 16 }}>
        {renderOption(UNCATEGORIZED_VALUE, t("library.moveToUncategorized"))}
        {folders.map((f) => renderOption(f.id, f.name, f.lecture_count))}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            color: "var(--text-muted)",
            background: "transparent",
            border: "1px solid var(--line)",
            cursor: "pointer",
          }}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={handleConfirm}
          className="rounded-lg"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "var(--gold)",
            border: "1px solid var(--gold)",
            cursor: canConfirm ? "pointer" : "not-allowed",
            opacity: canConfirm ? 1 : 0.5,
          }}
        >
          {t("common.confirm")}
        </button>
      </div>
    </Modal>
  );
}
