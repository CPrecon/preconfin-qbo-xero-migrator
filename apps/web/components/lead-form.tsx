"use client";

import { useRef, useState } from "react";
import { apiUrl } from "../lib/config";
import { track } from "../lib/analytics";
import { submitLead } from "../lib/lead-client";

export function LeadForm({
  source,
  jobId,
  onSuccess,
}: {
  source: string;
  jobId?: string;
  onSuccess?: () => void;
}) {
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const formElement = event.currentTarget;
    setStatus("submitting");
    setMessage("");
    const form = new FormData(formElement);
    const payload = {
      email: String(form.get("email") || ""),
      name: String(form.get("name") || "") || undefined,
      company: String(form.get("company") || "") || undefined,
      jobId,
      source,
    };
    try {
      const result = await submitLead({
        apiUrl,
        payload,
        track,
      });
      setStatus("success");
      setMessage(
        result.notifications.confirmation === "failed"
          ? "Thanks. We saved your request. Your email confirmation may be delayed."
          : "Thanks. We received your request and sent a confirmation email.",
      );
      onSuccess?.();
      formElement.reset();
    } catch {
      setStatus("error");
      setMessage("We could not submit the form. Please try again.");
      track("migration_failed", {
        source,
        stage: "lead",
        reason: "lead_submit_failed",
      });
    } finally {
      inFlight.current = false;
    }
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
