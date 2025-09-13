/* eslint-disable @typescript-eslint/no-explicit-any */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

type FetchOptions = RequestInit & { auth?: boolean };

export async function apiFetch(path: string, opts: FetchOptions = {}) {
    const { auth, headers, ...rest } = opts;
    const token = localStorage.getItem("access_token");

    const finalHeaders: Record<string, any> = {
        "Content-Type": "application/json",
        ...(headers || {}),
    };

    if (auth && token) {
        finalHeaders.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: finalHeaders,
    });

    if (res.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
    }

    return res;
}
