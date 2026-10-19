import { useEffect, useState, type FormEvent } from "react";

import { ApiError, createTask, deleteTask, listTasks, logout, updateTask, type Task, type TaskStatus } from "../api/client";
import { useAppSelector } from "../store/hooks";

const statusLabels: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export function DashboardPage() {
  const user = useAppSelector((state) => state.auth.user);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadTasks() {
    setError("");
    try {
      setTasks(await listTasks());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createTask(title, description);
      setTitle("");
      setDescription("");
      await loadTasks();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the task");
    } finally {
      setSaving(false);
    }
  }

  async function onStatus(task: Task, status: TaskStatus) {
    setError("");
    try {
      await updateTask(task.id, { status });
      await loadTasks();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the task");
    }
  }

  async function onDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) {
      return;
    }
    setError("");
    try {
      await deleteTask(task.id);
      await loadTasks();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete the task");
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-stone-600">
            {user ? user.name : "Account"}
          </p>
        </div>
        <button
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          type="button"
          onClick={() => void logout()}
        >
          Log out
        </button>
      </header>

      <form className="mb-8 space-y-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm" onSubmit={onCreate}>
        <label className="block text-sm font-medium">
          Title
          <input
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
          />
        </label>
        <button
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          type="submit"
          disabled={saving}
        >
          {saving ? "Adding…" : "Add task"}
        </button>
      </form>

      {error ? (
        <p className="mb-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-stone-600">Loading tasks…</p> : null}

      {!loading && tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-600">
          No tasks yet. Add one above.
        </p>
      ) : null}

      <ul className="space-y-3">
        {tasks.map((task) => (
          <li key={task.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                {/* React escapes this text. Do not switch it to dangerouslySetInnerHTML. */}
                <h2 className="font-medium">{task.title}</h2>
                {task.description ? <p className="mt-1 text-sm text-stone-600">{task.description}</p> : null}
              </div>
              <button className="text-sm text-red-700" type="button" onClick={() => void onDelete(task)}>
                Delete
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <label className="text-sm text-stone-600">
                Status
                <select
                  className="ml-2 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900"
                  value={task.status}
                  onChange={(event) => void onStatus(task, event.target.value as TaskStatus)}
                >
                  {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <time className="text-xs text-stone-500" dateTime={task.created_at}>
                {new Date(task.created_at).toLocaleString()}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
