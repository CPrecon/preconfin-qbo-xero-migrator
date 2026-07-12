"use client";

import { useState } from "react";
import { apiUrl } from "../lib/config";
import { track } from "../lib/analytics";

export function LeadForm({
  source,
  jobId,
}: {
  source: string;
  jobId?: string;
}) {
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") || ""),
      name: String(form.get("name") || "") || undefined,
      company: String(form.get("company") || "") || undefined,
      jobId,
      source,
    };
    const response = await fetch(`${apiUrl}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setStatus("error");
      setMessage("We could not submit the form. Please try again.");
      track("migration_failed", {
        source,
        stage: "lead",
        reason: "lead_submit_failed",
      });
      return;
    }
    track("migration_lead_submitted", { source, hasJob: Boolean(jobId) });
    setStatus("success");
    setMessage("Thanks. PreconFin will follow up with the right next step.");
    event.currentTarget.reset();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-ink/10 bg-white p-6 shadow-sm"
    >
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-ink">
          Name
          <input
            name="name"
            className="min-h-11 rounded-md border border-ink/15 px-3 outline-none focus:ring-2 focus:ring-teal"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-ink">
          Work email
          <input
            required
            type="email"
            name="email"
            className="min-h-11 rounded-md border border-ink/15 px-3 outline-none focus:ring-2 focus:ring-teal"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-ink">
          Company
          <input
            name="company"
            className="min-h-11 rounded-md border border-ink/15 px-3 outline-none focus:ring-2 focus:ring-teal"
          />
        </label>
        <button
          disabled={status === "submitting"}
          className="min-h-12 rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-[#185c60] disabled:opacity-60"
        >
          {status === "submitting" ? "Submitting" : "Contact PreconFin"}
        </button>
        {message && (
          <p
            role={status === "error" ? "alert" : "status"}
            className={
              status === "error" ? "text-sm text-red-700" : "text-sm text-teal"
            }
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
