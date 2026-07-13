"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Loader2, Trash2 } from "lucide-react";
import { apiUrl, supportUrl } from "../lib/config";
import { track } from "../lib/analytics";
import {
  captureAttribution,
  hasAttribution,
  withAttribution,
} from "../lib/attribution";
import { LeadForm } from "./lead-form";

type DownloadLink = {
  id: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  expiresAt?: string;
  url: string;
};
type WizardStatus = "" | "queued" | "running" | "completed" | "failed";

const storageKeys = ["connectionId", "connectionToken", "jobId", "jobToken"];

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return (
    new URLSearchParams(window.location.search).get(name) ||
    window.sessionStorage.getItem(name)
  );
}

function storeSession(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values))
    window.sessionStorage.setItem(key, value);
}

function leadStorageKey(jobId: string): string {
  return `leadSubmitted:${jobId}`;
}

export function MigrationWizard() {
  const initialConnectionId = useMemo(() => readParam("connectionId"), []);
  const initialConnectionToken = useMemo(
    () => readParam("connectionToken"),
    [],
  );
  const [connectionId, setConnectionId] = useState(initialConnectionId ?? "");
  const [connectionToken, setConnectionToken] = useState(
    initialConnectionToken ?? "",
  );
  const [jobId, setJobId] = useState(readParam("jobId") ?? "");
  const [jobToken, setJobToken] = useState(readParam("jobToken") ?? "");
  const [status, setStatus] = useState<WizardStatus>("");
  const [score, setScore] = useState<number | null>(null);
  const [readiness, setReadiness] = useState("");
  const [downloads, setDownloads] = useState<DownloadLink[]>([]);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const attribution = captureAttribution();
    if (hasAttribution(attribution)) {
      track("migration_referral_received", {
        source: "migration_wizard",
        ...attribution,
      });
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setLeadSubmitted(false);
      return;
    }
    setLeadSubmitted(
      window.sessionStorage.getItem(leadStorageKey(jobId)) === "true",
    );
  }, [jobId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const returnedConnectionId = url.searchParams.get("connectionId");
    const returnedConnectionToken = url.searchParams.get("connectionToken");
    if (returnedConnectionId && returnedConnectionToken) {
      setConnectionId(returnedConnectionId);
      setConnectionToken(returnedConnectionToken);
      storeSession({
        connectionId: returnedConnectionId,
        connectionToken: returnedConnectionToken,
      });
      track("qbo_oauth_completed", { source: "migration_wizard" });
      url.searchParams.delete("connectionId");
      url.searchParams.delete("connectionToken");
      window.history.replaceState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, []);

  function connectQbo() {
    track("qbo_connect_clicked", { source: "migration_wizard" });
    track("qbo_oauth_started", { source: "migration_wizard" });
    const returnTo = `${window.location.origin}/migrate${window.location.search}`;
    window.location.href = `${apiUrl}/api/oauth/qbo/start?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function runScan() {
    setBusy(true);
    setError("");
    track("migration_scan_started", { source: "migration_wizard" });
    try {
      if (!connectionId || !connectionToken)
        throw new Error("Connect QuickBooks before running a scan.");
      const create = await fetch(`${apiUrl}/api/migration-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, connectionToken }),
      });
      if (!create.ok) throw new Error(await safeError(create));
      const created = await create.json();
      setJobId(created.jobId);
      setJobToken(created.jobToken);
      setLeadSubmitted(false);
      storeSession({
        jobId: created.jobId,
        jobToken: created.jobToken,
        connectionId,
        connectionToken,
      });
      window.sessionStorage.removeItem(leadStorageKey(created.jobId));
      setStatus("running");

      const run = await fetch(
        `${apiUrl}/api/migration-jobs/${created.jobId}/run`,
        {
          method: "POST",
          headers: { "x-migration-token": created.jobToken },
        },
      );
      if (!run.ok) throw new Error(await safeError(run));
      const result = await run.json();
      setScore(result.score);
      setReadiness(result.readiness);
      setStatus("completed");
      track("migration_scan_completed", {
        source: "migration_wizard",
        readiness: result.readiness,
      });
      track("migration_validation_completed", {
        source: "migration_wizard",
        readiness: result.readiness,
      });
      track("migration_package_generated", {
        source: "migration_wizard",
        readiness: result.readiness,
      });
      await loadDownloads(created.jobId, created.jobToken);
    } catch (err) {
      setStatus("failed");
      const message =
        err instanceof Error ? err.message : "Migration scan failed.";
      setError(message);
      track("migration_failed", { source: "migration_wizard", stage: "scan" });
    } finally {
      setBusy(false);
    }
  }

  async function loadDownloads(nextJobId = jobId, nextJobToken = jobToken) {
    if (!nextJobId || !nextJobToken) return;
    const response = await fetch(
      `${apiUrl}/api/migration-jobs/${nextJobId}/downloads`,
      { headers: { "x-migration-token": nextJobToken } },
    );
    if (!response.ok) throw new Error(await safeError(response));
    const payload = await response.json();
    setDownloads(payload.downloads ?? []);
  }

  function markLeadSubmitted() {
    if (jobId) window.sessionStorage.setItem(leadStorageKey(jobId), "true");
    setLeadSubmitted(true);
  }

  async function deleteScan() {
    if (!jobId || !jobToken) return;
    await fetch(`${apiUrl}/api/migration-jobs/${jobId}`, {
      method: "DELETE",
      headers: { "x-migration-token": jobToken },
    });
    setJobId("");
    setJobToken("");
    setStatus("");
    setScore(null);
    setReadiness("");
    setDownloads([]);
    setLeadSubmitted(false);
    for (const key of storageKeys) window.sessionStorage.removeItem(key);
  }

  function openPreconfinConsultation(event: React.MouseEvent) {
    event.preventDefault();
    track("preconfin_cta_clicked", {
      source: "migration_wizard_completion",
    });
    window.location.href = withAttribution(
      supportUrl,
      "qbo_xero_migrator_completion",
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.85fr_1fr]">
      <section className="rounded-lg border border-ink/10 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal">
          Migration wizard
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
          Generate your Xero-ready migration package.
        </h1>
        <p className="mt-4 leading-7 text-ink/70">
          Connect QuickBooks Online with read-only access, run the validation
          scan, then download your files and report. Version 1 does not write to
          QuickBooks or Xero.
        </p>
        <div className="mt-6 space-y-3">
          <button
            onClick={connectQbo}
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-[#185c60]"
          >
            {connectionId
              ? "Reconnect QuickBooks"
              : "Connect QuickBooks Online"}
          </button>
          <button
            onClick={runScan}
            disabled={busy || !connectionId || !connectionToken}
            className="flex min-h-12 w-full items-center justify-center rounded-full border border-ink/15 bg-white px-5 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {busy ? (
              <Loader2
                aria-hidden="true"
                className="mr-2 h-4 w-4 animate-spin"
              />
            ) : (
              <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
            )}
            Run migration scan
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-ink">Scan status</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-paper p-4">
            <p className="text-xs font-semibold uppercase text-ink/50">
              QuickBooks
            </p>
            <p className="mt-2 font-semibold">
              {connectionId ? "Connected" : "Not connected"}
            </p>
          </div>
          <div className="rounded-lg bg-paper p-4">
            <p className="text-xs font-semibold uppercase text-ink/50">Stage</p>
            <p className="mt-2 font-semibold">{statusLabel(status)}</p>
          </div>
          <div className="rounded-lg bg-paper p-4">
            <p className="text-xs font-semibold uppercase text-ink/50">Score</p>
            <p className="mt-2 font-semibold">
              {score === null ? "Pending" : `${score}/100`}
            </p>
          </div>
        </div>
        <ol className="mt-5 grid gap-2 text-sm text-ink/70">
          {stageRows(status).map((item) => (
            <li
              key={item.label}
              className="flex items-center justify-between rounded-md border border-ink/10 px-3 py-2"
            >
              <span>{item.label}</span>
              <span className="font-medium text-teal">{item.state}</span>
            </li>
          ))}
        </ol>
        {readiness && (
          <p className="mt-4 rounded-md bg-[#e9f5f3] p-3 text-sm font-medium text-teal">
            Readiness: {readiness.replace("_", " ")}
          </p>
        )}
        {downloads.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold text-ink">Downloads</h3>
            {leadSubmitted ? (
              downloads.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  onClick={() => {
                    track("migration_package_downloaded", {
                      source: "migration_wizard",
                      kind: item.kind,
                    });
                    if (item.kind === "pdf")
                      track("migration_report_viewed", {
                        source: "migration_wizard",
                      });
                    if (item.kind === "zip")
                      track("migration_mapping_reviewed", {
                        source: "migration_wizard",
                      });
                  }}
                  className="flex min-h-12 items-center justify-between rounded-lg border border-ink/10 px-4 text-sm hover:bg-paper"
                >
                  <span>
                    {item.kind.toUpperCase()} ·{" "}
                    {(item.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                  <Download aria-hidden="true" className="h-4 w-4 text-teal" />
                </a>
              ))
            ) : (
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <h4 className="font-semibold text-ink">
                  Send the package to your work email.
                </h4>
                <p className="mt-2 text-sm leading-6 text-ink/70">
                  Your scan is complete. Submit your details to unlock the ZIP
                  package and PDF report links in this browser.
                </p>
                <div className="mt-4">
                  <LeadForm
                    source="migration-package-download"
                    jobId={jobId}
                    onSuccess={markLeadSubmitted}
                  />
                </div>
              </div>
            )}
            <button
              onClick={deleteScan}
              className="inline-flex min-h-11 items-center rounded-full text-sm font-semibold text-red-700"
            >
              <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
              Delete scan
            </button>
          </div>
        )}
        {status === "completed" && leadSubmitted && (
          <div className="mt-8 border-t border-ink/10 pt-6">
            <h3 className="text-lg font-semibold">
              Want help reviewing the report?
            </h3>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              PreconFin can help review exceptions, mappings, and next steps
              before your Xero import.
            </p>
            <a
              href={supportUrl}
              onClick={openPreconfinConsultation}
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-teal px-5 text-sm font-semibold text-white hover:bg-[#185c60]"
            >
              Talk to PreconFin
            </a>
          </div>
        )}
        <p className="mt-6 text-xs leading-5 text-ink/50">
          Generated files should be reviewed before import. Test in a Xero demo
          organization first.
        </p>
        <Link
          href="/contact"
          onClick={() =>
            track("preconfin_cta_clicked", {
              source: "migration_wizard_contact",
            })
          }
          className="mt-4 inline-flex text-sm font-semibold text-teal"
        >
          Talk to PreconFin
        </Link>
      </section>
    </div>
  );
}

async function safeError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload.error === "string") return payload.error;
  } catch {
    return "Request failed. Please try again.";
  }
  return "Request failed. Please try again.";
}

function statusLabel(status: WizardStatus): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Needs attention";
  return "Not started";
}

function stageRows(
  status: WizardStatus,
): Array<{ label: string; state: string }> {
  return [
    { label: "QuickBooks connection", state: status || "Ready when connected" },
    {
      label: "Read-only extraction",
      state:
        status === "running"
          ? "Running"
          : status === "completed"
            ? "Complete"
            : "Waiting",
    },
    {
      label: "Validation and mapping",
      state:
        status === "completed"
          ? "Complete"
          : status === "failed"
            ? "Retry needed"
            : "Waiting",
    },
    {
      label: "ZIP and PDF package",
      state: status === "completed" ? "Ready" : "Waiting",
    },
  ];
}
