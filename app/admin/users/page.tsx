"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

interface User {
  _id: string;
  fullName: string;
  email: string;
  role: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users", {
        credentials: "include",
      });

      const data = await res.json();

      if (res.ok) {
        setUsers(data.users);
      } else {
        console.error(data.message);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const promoteUser = async (userId: string) => {
    try {
      const res = await fetch("/api/admin/users/promote", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("User promoted to admin.");
        fetchUsers();
      } else {
        toast.error(data.message || "Promotion failed.");
      }
    } catch {
      toast.error("Something went wrong.");
    }
  };
  const deleteUser = async (userId: string) => {
    const confirmDelete = confirm("Are you sure you want to delete this user?");
    if (!confirmDelete) return;

    try {
      const res = await fetch("/api/admin/users/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("User deleted successfully.");
        fetchUsers();
      } else {
        toast.error(data.message || "Delete failed.");
      }
    } catch {
      toast.error("Something went wrong.");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center py-12 text-white">
        Loading users...
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white">
          Users
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          All Users
        </h1>
        <p className="mt-1 text-sm text-neutral-300">
          Manage platform users and admin roles.
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-black shadow-xl shadow-black/60">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-neutral-900 border-b border-neutral-800 text-white">
              <tr>
                <th className="py-3 px-4 w-1/4 text-left font-medium">Name</th>
                <th className="px-4 w-1/3 text-left font-medium">Email</th>
                <th className="px-4 w-1/6 text-left font-medium">Role</th>
                <th className="px-4 w-1/4 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr
                  key={user._id}
                  className={`border-b border-neutral-800 ${
                    index % 2 === 0 ? "bg-black" : "bg-neutral-900"
                  } hover:bg-neutral-800 transition-colors`}
                >
                  <td className="py-4 px-4 break-words font-medium text-white">
                    <a
                      href={`/admin/users/${user._id}`}
                      className="text-yellow-400 hover:underline"
                    >
                      {user.fullName}
                    </a>
                  </td>

                  <td className="px-4 break-words text-neutral-200">
                    {user.email}
                  </td>

                  <td className="px-4 capitalize font-semibold text-neutral-100">
                    {user.role}
                  </td>

                  <td className="px-4">
                    <div className="flex flex-col sm:flex-row justify-center gap-2">
                      {user.role !== "admin" && (
                        <button
                          onClick={() => promoteUser(user._id)}
                          className="px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition w-full sm:w-auto"
                        >
                          Promote
                        </button>
                      )}

                      <button
                        onClick={() => deleteUser(user._id)}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition w-full sm:w-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
